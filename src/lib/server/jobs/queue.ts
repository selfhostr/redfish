import { and, asc, eq, inArray, lte, or } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { jobs, type Job } from '$lib/server/db/schema';

export const MAX_ATTEMPTS = 5;
/** Délai de base du backoff exponentiel : now + 2^attempts * BASE_MS. */
export const BASE_MS = 30_000;
/** Durée du bail : un job « running » plus ancien est considéré abandonné et reprenable. */
export const LEASE_MS = 5 * 60_000;
export const BATCH_SIZE = 10;

type Handler = (payload: unknown) => Promise<void>;
const handlers = new Map<string, Handler>();

/** Enregistre le handler d'un type de job (registre en mémoire du process). */
export function registerHandler<T = any>(type: string, fn: (payload: T) => Promise<void>) {
	handlers.set(type, fn as Handler);
}

export async function enqueue(type: string, payload: unknown, runAt = new Date()): Promise<Job> {
	return db
		.insert(jobs)
		.values({
			type,
			payloadJson: JSON.stringify(payload ?? null),
			runAt,
			status: 'queued'
		})
		.returning()
		.get();
}

/**
 * Prend un bail sur les jobs dus dont le type a un handler enregistré
 * (queued/retry, ou running dont le bail a expiré). Sans handler : rien.
 * Transaction IMMEDIATE (le worker et l'app partagent le fichier SQLite) :
 * un job n'est réclamé qu'une fois. Reprendre un job « running » expiré compte
 * une tentative ; à MAX_ATTEMPTS il passe 'failed' au lieu d'être relancé.
 */
export function claimDueJobs(limit: number, now: Date): Job[] {
	const types = [...handlers.keys()];
	if (types.length === 0) return [];
	return db.transaction(
		(tx) => {
			const expired = new Date(now.getTime() - LEASE_MS);
			const due = tx
				.select()
				.from(jobs)
				.where(
					and(
						inArray(jobs.type, types),
						or(
							and(inArray(jobs.status, ['queued', 'retry']), lte(jobs.runAt, now)),
							and(eq(jobs.status, 'running'), lte(jobs.lockedAt, expired))
						)
					)
				)
				.orderBy(asc(jobs.runAt))
				.limit(limit)
				.all();
			const claimed: Job[] = [];
			for (const j of due) {
				const attempts = j.status === 'running' ? j.attempts + 1 : j.attempts;
				if (attempts >= MAX_ATTEMPTS) {
					tx.update(jobs)
						.set({ status: 'failed', attempts, lockedAt: null })
						.where(eq(jobs.id, j.id))
						.run();
					continue;
				}
				claimed.push(
					tx
						.update(jobs)
						.set({ status: 'running', lockedAt: now, attempts })
						.where(eq(jobs.id, j.id))
						.returning()
						.get()
				);
			}
			return claimed;
		},
		{ behavior: 'immediate' }
	);
}

/**
 * Un tick : réclame un lot borné et exécute les handlers. Les écritures finales
 * sont protégées par le bail (status running + lockedAt de CE claim) : si le job
 * a été repris entre-temps, on n'écrase pas l'état du nouveau détenteur.
 */
export async function runDueJobs(now = new Date()): Promise<{ ran: number; failed: number }> {
	let ran = 0;
	let failed = 0;
	for (const job of claimDueJobs(BATCH_SIZE, now)) {
		const handler = handlers.get(job.type)!;
		const fence = and(
			eq(jobs.id, job.id),
			eq(jobs.status, 'running'),
			eq(jobs.lockedAt, job.lockedAt!)
		);
		try {
			await handler(JSON.parse(job.payloadJson));
			db.update(jobs).set({ status: 'done', lockedAt: null }).where(fence).run();
			ran++;
		} catch (err) {
			const attempts = job.attempts + 1;
			console.error(`job ${job.id} (${job.type}) failed (attempt ${attempts}):`, err);
			db.update(jobs)
				.set(
					attempts < MAX_ATTEMPTS
						? {
								attempts,
								status: 'retry',
								lockedAt: null,
								runAt: new Date(now.getTime() + 2 ** attempts * BASE_MS)
							}
						: { attempts, status: 'failed', lockedAt: null }
				)
				.where(fence)
				.run();
			failed++;
		}
	}
	return { ran, failed };
}

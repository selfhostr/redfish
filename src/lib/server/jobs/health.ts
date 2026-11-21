import { and, count, eq, gte, inArray, lte, min } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { jobs, workerHeartbeat } from '$lib/server/db/schema';

/** Au-delà de ce délai sans battement, le worker est considéré à l'arrêt. */
export const WORKER_STALE_MS = 3 * 60_000;
/** Fenêtre de prise en compte des échecs (runAt = dernière tentative). */
export const FAILED_WINDOW_MS = 24 * 3_600_000;
const HEARTBEAT_ID = 'worker';

/** Enregistre un battement de cœur du worker (appelé à chaque boucle). */
export function recordHeartbeat(now = new Date()): void {
	db.insert(workerHeartbeat)
		.values({ id: HEARTBEAT_ID, beatAt: now })
		.onConflictDoUpdate({ target: workerHeartbeat.id, set: { beatAt: now } })
		.run();
}

export type QueueHealth = {
	failedJobs: number;
	/** Âge (ms) du plus ancien job dû non traité (queued/retry), null si aucun. */
	oldestDueAgeMs: number | null;
	/** Dernier battement du worker, null s'il n'a jamais battu. */
	lastHeartbeat: Date | null;
	/** Vrai si aucun battement récent (ou jamais). */
	workerDown: boolean;
	/** Vrai si une alerte doit être affichée. */
	needsAttention: boolean;
};

/** Résumé de santé de la file : agrégats uniquement, aucune donnée de payload. */
export function getQueueHealth(now = new Date()): QueueHealth {
	const failed = db
		.select({ n: count() })
		.from(jobs)
		.where(
			and(eq(jobs.status, 'failed'), gte(jobs.runAt, new Date(now.getTime() - FAILED_WINDOW_MS)))
		)
		.get();
	const oldest = db
		.select({ at: min(jobs.runAt) })
		.from(jobs)
		.where(and(inArray(jobs.status, ['queued', 'retry']), lte(jobs.runAt, now)))
		.get();
	const beat = db.select().from(workerHeartbeat).where(eq(workerHeartbeat.id, HEARTBEAT_ID)).get();

	const failedJobs = failed?.n ?? 0;
	const oldestDueAgeMs = oldest?.at ? now.getTime() - new Date(oldest.at).getTime() : null;
	const lastHeartbeat = beat?.beatAt ?? null;
	const workerDown = !lastHeartbeat || now.getTime() - lastHeartbeat.getTime() > WORKER_STALE_MS;
	return {
		failedJobs,
		oldestDueAgeMs,
		lastHeartbeat,
		workerDown,
		needsAttention: workerDown || failedJobs > 0
	};
}

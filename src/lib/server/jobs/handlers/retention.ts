import { enqueue, registerHandler } from '$lib/server/jobs/queue';
import { anonymizeExpired } from '$lib/server/retention';
import { db } from '$lib/server/db';
import { jobs } from '$lib/server/db/schema';
import { and, eq, inArray } from 'drizzle-orm';

const DAY_MS = 86_400_000;

/**
 * Planifie la prochaine purge si aucune n'est déjà en attente (idempotent :
 * appelé au démarrage du worker (exécution immédiate) et à la fin de chaque exécution).
 */
export async function scheduleRetention(runAt = new Date()): Promise<void> {
	const pending = db
		.select({ id: jobs.id })
		.from(jobs)
		.where(and(eq(jobs.type, 'retention'), inArray(jobs.status, ['queued', 'retry'])))
		.get();
	if (!pending) await enqueue('retention', null, runAt);
}

// Le job se replanifie lui-même (+24 h) ; le worker amorce la première
// occurrence au démarrage via scheduleRetention(new Date()).
registerHandler('retention', async () => {
	const { anonymized } = await anonymizeExpired();
	console.log(`retention: ${anonymized} cible(s) anonymisée(s)`);
	await scheduleRetention(new Date(Date.now() + DAY_MS));
});

import { and, eq, inArray } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { jobs } from '$lib/server/db/schema';
import { audit } from '$lib/server/audit';
import { completeDueCampaigns } from '$lib/server/campaigns/completion';
import { enqueue, registerHandler } from '$lib/server/jobs/queue';

const INTERVAL_MS = 60 * 60_000;

/** Planifie la prochaine vérification si aucune n'est en attente (idempotent). */
export async function scheduleCompletionCheck(runAt = new Date()): Promise<void> {
	const pending = db
		.select({ id: jobs.id })
		.from(jobs)
		.where(and(eq(jobs.type, 'campaign-completion'), inArray(jobs.status, ['queued', 'retry'])))
		.get();
	if (!pending) await enqueue('campaign-completion', null, runAt);
}

registerHandler('campaign-completion', async () => {
	try {
		for (const id of completeDueCampaigns()) {
			audit(null, 'campaign.complete', {
				targetType: 'campaign',
				targetId: id,
				details: { auto: true }
			});
		}
	} finally {
		await scheduleCompletionCheck(new Date(Date.now() + INTERVAL_MS));
	}
});

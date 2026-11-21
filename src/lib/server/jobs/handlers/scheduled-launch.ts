import { and, eq, inArray, lte } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { campaigns, jobs } from '$lib/server/db/schema';
import { launchCampaign } from '$lib/server/campaigns/launch';
import { canSendCampaign } from '$lib/server/authorization';
import { enqueue, registerHandler } from '$lib/server/jobs/queue';

const INTERVAL_MS = 2 * 60_000;

/** Lance les campagnes planifiées échues et autorisées ; renvoie le nombre lancé. */
export async function launchDueCampaigns(now = new Date()): Promise<number> {
	const due = db
		.select({ id: campaigns.id })
		.from(campaigns)
		.where(and(eq(campaigns.status, 'scheduled'), lte(campaigns.scheduledAt, now)))
		.all();
	let launched = 0;
	for (const { id } of due) {
		try {
			const check = await canSendCampaign(id, now);
			if (!check.ok) {
				console.warn(
					`scheduled-launch: campagne ${id} non lancée (${check.reason ?? 'non autorisée'})`
				);
				continue;
			}
			await launchCampaign(id, now);
			launched++;
		} catch (e) {
			// Une campagne en échec ne doit pas bloquer les autres.
			console.error(`scheduled-launch: échec pour la campagne ${id}`, e);
		}
	}
	return launched;
}

/** Planifie la prochaine vérification si aucune n'est en attente (idempotent). */
export async function scheduleLaunchCheck(runAt = new Date()): Promise<void> {
	const pending = db
		.select({ id: jobs.id })
		.from(jobs)
		.where(and(eq(jobs.type, 'scheduled-launch'), inArray(jobs.status, ['queued', 'retry'])))
		.get();
	if (!pending) await enqueue('scheduled-launch', null, runAt);
}

registerHandler('scheduled-launch', async () => {
	try {
		const n = await launchDueCampaigns();
		if (n > 0) console.log(`scheduled-launch: ${n} campagne(s) lancée(s)`);
	} finally {
		await scheduleLaunchCheck(new Date(Date.now() + INTERVAL_MS));
	}
});

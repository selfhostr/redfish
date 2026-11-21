import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { campaignRecipients, campaigns, jobs, targets } from '$lib/server/db/schema';
import { canSendCampaign } from '../authorization';

export type LaunchErrorCode = 'not_found' | 'bad_status' | 'unauthorized' | 'empty_list';

/** Échec de lancement attendu (mappable en message utilisateur). */
export class LaunchError extends Error {
	constructor(
		public code: LaunchErrorCode,
		message: string
	) {
		super(message);
		this.name = 'LaunchError';
	}
}

/** Écart entre deux envois consécutifs (enfilement étalé). */
export const STAGGER_MS = 3_000;

const newToken = () => randomBytes(32).toString('base64url');

/**
 * Lance une campagne : re-vérifie l'autorisation, crée un destinataire (token
 * opaque) par cible et un job `send-email` étalé par destinataire, puis passe
 * la campagne à « sending ». Tout est écrit dans une seule transaction.
 */
export async function launchCampaign(
	campaignId: string,
	now: Date = new Date()
): Promise<{ recipients: number }> {
	const campaign = db.select().from(campaigns).where(eq(campaigns.id, campaignId)).get();
	if (!campaign) throw new LaunchError('not_found', 'Campagne introuvable');
	if (campaign.status !== 'draft' && campaign.status !== 'scheduled')
		throw new LaunchError('bad_status', `Campagne déjà lancée (statut : ${campaign.status})`);
	const check = await canSendCampaign(campaignId, now);
	if (!check.ok) throw new LaunchError('unauthorized', check.reason ?? 'Envoi non autorisé');

	return db.transaction(
		(tx) => {
			// Re-lecture dans la transaction : évite un double lancement concurrent.
			const fresh = tx.select().from(campaigns).where(eq(campaigns.id, campaignId)).get();
			if (!fresh || (fresh.status !== 'draft' && fresh.status !== 'scheduled'))
				throw new LaunchError('bad_status', 'Campagne déjà lancée');
			const list = tx.select().from(targets).where(eq(targets.listId, campaign.targetListId)).all();
			if (list.length === 0) throw new LaunchError('empty_list', 'Liste de cibles vide');
			list.forEach((t, index) => {
				const rec = tx
					.insert(campaignRecipients)
					.values({
						campaignId,
						targetId: t.id,
						token: newToken(),
						sendStatus: 'pending'
					})
					.returning()
					.get();
				// Même forme de ligne que queue.enqueue, mais dans la transaction.
				tx.insert(jobs)
					.values({
						type: 'send-email',
						payloadJson: JSON.stringify({ recipientId: rec.id }),
						runAt: new Date(now.getTime() + index * STAGGER_MS),
						status: 'queued'
					})
					.run();
			});
			tx.update(campaigns).set({ status: 'sending' }).where(eq(campaigns.id, campaignId)).run();
			return { recipients: list.length };
		},
		{ behavior: 'immediate' }
	);
}

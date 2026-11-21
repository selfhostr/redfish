import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { campaignRecipients, campaigns, jobs, targets } from '$lib/server/db/schema';

export type FailedRecipient = { id: string; name: string; email: string; reason: string };

/** Destinataires dont l'envoi a échoué définitivement, avec le motif enregistré. */
export function listFailedRecipients(campaignId: string): FailedRecipient[] {
	return db
		.select({
			id: campaignRecipients.id,
			first: targets.firstName,
			last: targets.lastName,
			email: targets.email,
			reason: campaignRecipients.sendError
		})
		.from(campaignRecipients)
		.innerJoin(targets, eq(campaignRecipients.targetId, targets.id))
		.where(
			and(
				eq(campaignRecipients.campaignId, campaignId),
				eq(campaignRecipients.sendStatus, 'failed')
			)
		)
		.orderBy(campaignRecipients.id)
		.all()
		.map((r) => ({
			id: r.id,
			name: `${r.first ?? ''} ${r.last ?? ''}`.trim(),
			email: r.email,
			reason: r.reason ?? 'Motif inconnu'
		}));
}

/**
 * Remet en file les envois en échec (destinataire → 'pending' + nouveau job).
 * Refusé si la campagne n'est pas en cours d'envoi (ex. terminée). Renvoie le
 * nombre de destinataires remis en file.
 */
export function retryFailedSends(campaignId: string, now = new Date()): number {
	return db.transaction(
		(tx) => {
			const c = tx.select().from(campaigns).where(eq(campaigns.id, campaignId)).get();
			if (!c || c.status !== 'sending') return 0;
			const failed = tx
				.select({ id: campaignRecipients.id })
				.from(campaignRecipients)
				.where(
					and(
						eq(campaignRecipients.campaignId, campaignId),
						eq(campaignRecipients.sendStatus, 'failed')
					)
				)
				.all();
			for (const r of failed) {
				tx.update(campaignRecipients)
					.set({ sendStatus: 'pending', sendError: null })
					.where(eq(campaignRecipients.id, r.id))
					.run();
				tx.insert(jobs)
					.values({
						type: 'send-email',
						payloadJson: JSON.stringify({ recipientId: r.id }),
						runAt: now,
						status: 'queued'
					})
					.run();
			}
			return failed.length;
		},
		{ behavior: 'immediate' }
	);
}

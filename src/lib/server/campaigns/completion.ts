import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { campaignRecipients, campaigns, jobs } from '$lib/server/db/schema';
import { isObservationOver } from './stagger';

const DAY_MS = 86_400_000;
export const DEFAULT_OBSERVATION_DAYS = 14;

/** Fenêtre d'observation (jours) : `CAMPAIGN_OBSERVATION_DAYS`, 14 par défaut. */
export function observationDays(): number {
	const raw = process.env.CAMPAIGN_OBSERVATION_DAYS?.trim();
	const n = raw ? Number(raw) : NaN;
	return Number.isFinite(n) && n >= 0 ? n : DEFAULT_OBSERVATION_DAYS;
}

/**
 * Clôture les campagnes « sending » dont tous les jobs d'envoi sont terminés
 * (envoyés ou définitivement en échec) et dont le dernier envoi, effectif ou
 * planifié (étalement), date de plus de la fenêtre d'observation. Renvoie les
 * ids clôturés.
 */
export function completeDueCampaigns(now = new Date()): string[] {
	const windowMs = observationDays() * DAY_MS;
	const done: string[] = [];
	for (const c of db.select().from(campaigns).where(eq(campaigns.status, 'sending')).all()) {
		const recipients = db
			.select({
				id: campaignRecipients.id,
				sentAt: campaignRecipients.sentAt,
				plannedAt: campaignRecipients.plannedAt
			})
			.from(campaignRecipients)
			.where(eq(campaignRecipients.campaignId, c.id))
			.all();
		const ids = recipients.map((r) => r.id);
		// Un job encore actif (en file, en cours, en réessai) bloque la clôture.
		const active = ids.length
			? db
					.select({ id: jobs.id })
					.from(jobs)
					.where(
						and(
							eq(jobs.type, 'send-email'),
							inArray(jobs.status, ['queued', 'running', 'retry']),
							inArray(sql`json_extract(${jobs.payloadJson}, '$.recipientId')`, ids)
						)
					)
					.get()
			: undefined;
		if (active) continue;
		if (!isObservationOver(c.createdAt, recipients, windowMs, now)) continue;
		if (completeCampaign(c.id, now)) done.push(c.id);
	}
	return done;
}

/**
 * Clôture (« sending » uniquement). Renvoie false si le statut ne le permet pas.
 * Les envois encore planifiés sont annulés : jobs en file supprimés,
 * destinataires en attente marqués « skipped » (un envoi déjà en cours se
 * termine ; le handler ignore de toute façon une campagne qui n'est plus
 * « sending »).
 */
export function completeCampaign(campaignId: string, now = new Date()): boolean {
	return db.transaction(
		(tx) => {
			const res = tx
				.update(campaigns)
				.set({ status: 'completed', completedAt: now })
				.where(and(eq(campaigns.id, campaignId), eq(campaigns.status, 'sending')))
				.run();
			if (res.changes === 0) return false;
			const pending = tx
				.select({ id: campaignRecipients.id })
				.from(campaignRecipients)
				.where(
					and(
						eq(campaignRecipients.campaignId, campaignId),
						eq(campaignRecipients.sendStatus, 'pending')
					)
				)
				.all()
				.map((r) => r.id);
			if (pending.length > 0) {
				tx.delete(jobs)
					.where(
						and(
							eq(jobs.type, 'send-email'),
							inArray(jobs.status, ['queued', 'retry']),
							inArray(sql`json_extract(${jobs.payloadJson}, '$.recipientId')`, pending)
						)
					)
					.run();
				tx.update(campaignRecipients)
					.set({ sendStatus: 'skipped' })
					.where(inArray(campaignRecipients.id, pending))
					.run();
			}
			return true;
		},
		{ behavior: 'immediate' }
	);
}

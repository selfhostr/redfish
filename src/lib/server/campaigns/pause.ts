import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { campaignRecipients, campaigns, jobs } from '$lib/server/db/schema';
import type { SendingPace } from '$lib/server/campaigns';
import { tenantTimezone } from '$lib/server/tenant';
import { enqueuePendingSends } from './launch';
import { isValidTrackingDomain } from './preflight';

/**
 * Met en pause une campagne en cours d'envoi : statut « sending » → « paused »
 * et suppression des jobs `send-email` encore en file ou en réessai visant ses
 * destinataires, pour que le worker arrête d'envoyer. Les destinataires déjà
 * envoyés restent « sent » ; ceux encore « pending » restent « pending » (ils
 * seront remis en file à la reprise). Un éventuel job déjà « running » n'est pas
 * supprimé mais le handler n'envoie rien tant que la campagne n'est pas
 * « sending ». Transition refusée (renvoie false) si la campagne n'est pas
 * « sending ».
 */
export function pauseCampaign(campaignId: string): boolean {
	return db.transaction(
		(tx) => {
			const res = tx
				.update(campaigns)
				.set({ status: 'paused' })
				.where(and(eq(campaigns.id, campaignId), eq(campaigns.status, 'sending')))
				.run();
			if (res.changes === 0) return false;
			const recipientIds = tx
				.select({ id: campaignRecipients.id })
				.from(campaignRecipients)
				.where(eq(campaignRecipients.campaignId, campaignId))
				.all()
				.map((r) => r.id);
			if (recipientIds.length > 0) {
				tx.delete(jobs)
					.where(
						and(
							eq(jobs.type, 'send-email'),
							inArray(jobs.status, ['queued', 'retry']),
							inArray(sql`json_extract(${jobs.payloadJson}, '$.recipientId')`, recipientIds)
						)
					)
					.run();
			}
			return true;
		},
		{ behavior: 'immediate' }
	);
}

/**
 * Reprend une campagne en pause : statut « paused » → « sending » et remise en
 * file des envois des destinataires encore « pending », avec une heure planifiée
 * recalculée à partir de `now` (le rythme d'envoi repart de l'instant de
 * reprise, pas du lancement d'origine ; la fenêtre d'observation suit, puisqu'elle
 * part du dernier envoi planifié). Transition refusée (renvoie false) si la
 * campagne n'est pas « paused ».
 */
export function resumeCampaign(campaignId: string, now: Date = new Date()): boolean {
	const campaign = db.select().from(campaigns).where(eq(campaigns.id, campaignId)).get();
	if (!campaign || campaign.status !== 'paused') return false;
	const timeZone = tenantTimezone(campaign.tenantId);
	return db.transaction(
		(tx) => {
			const fresh = tx.select().from(campaigns).where(eq(campaigns.id, campaignId)).get();
			if (!fresh || fresh.status !== 'paused') return false;
			tx.update(campaigns).set({ status: 'sending' }).where(eq(campaigns.id, campaignId)).run();
			enqueuePendingSends(tx, fresh, timeZone, now);
			return true;
		},
		{ behavior: 'immediate' }
	);
}

/** Champs modifiables d'une campagne en pause. */
export type PausedEdit = {
	trackingDomain: string;
	awarenessMessage: string | null;
	pace: SendingPace;
};

export type PausedEditResult = { ok: true; changed: string[] } | { ok: false; error: string };

/**
 * Modifie un sous-ensemble limité de champs d'une campagne EN PAUSE : domaine de
 * tracking, message de sensibilisation et rythme d'envoi (étalement / heures
 * ouvrées). Ni le scénario, ni le profil d'envoi, ni la liste de cibles ne sont
 * modifiables (les destinataires existent déjà). Le domaine de tracking est
 * revalidé comme à la création. Renvoie la liste des champs réellement modifiés
 * (pour l'audit) ou une erreur. Refusé si la campagne n'est pas « paused ».
 */
export function editPausedCampaign(campaignId: string, edit: PausedEdit): PausedEditResult {
	const trackingDomain = edit.trackingDomain.trim();
	if (!trackingDomain) return { ok: false, error: 'Domaine de tracking requis.' };
	if (!isValidTrackingDomain(trackingDomain))
		return { ok: false, error: 'Domaine de tracking invalide.' };
	const awarenessMessage = edit.awarenessMessage?.trim() || null;
	return db.transaction(
		(tx) => {
			const c = tx.select().from(campaigns).where(eq(campaigns.id, campaignId)).get();
			if (!c || c.status !== 'paused')
				return { ok: false, error: 'Seule une campagne en pause peut être modifiée.' };
			const changed: string[] = [];
			if (c.trackingDomain !== trackingDomain) changed.push('trackingDomain');
			if ((c.awarenessMessage ?? null) !== awarenessMessage) changed.push('awarenessMessage');
			if (
				c.spreadHours !== edit.pace.spreadHours ||
				c.workingHoursOnly !== edit.pace.workingHoursOnly ||
				c.workStartHour !== edit.pace.workStartHour ||
				c.workEndHour !== edit.pace.workEndHour
			)
				changed.push('pace');
			tx.update(campaigns)
				.set({ trackingDomain, awarenessMessage, ...edit.pace })
				.where(eq(campaigns.id, campaignId))
				.run();
			return { ok: true, changed };
		},
		{ behavior: 'immediate' }
	);
}

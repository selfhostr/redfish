import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { formatZoned } from '$lib/timezone';
import { campaignRecipients, campaigns, jobs, targets } from '$lib/server/db/schema';
import { canSendCampaign, listAuthorizations } from '../authorization';
import { isValidEmail } from '../targets';
import { tenantTimezone } from '../tenant';
import { DEFAULT_WORK_END_HOUR, DEFAULT_WORK_START_HOUR, planSends } from './stagger';
import { runPreflight } from './preflight';
import type { PreflightReport } from './preflight';

export type LaunchErrorCode =
	| 'not_found'
	| 'bad_status'
	| 'unauthorized'
	| 'empty_list'
	| 'preflight_failed'
	| 'window_unauthorized';

/** Échec de lancement attendu (mappable en message utilisateur). */
export class LaunchError extends Error {
	constructor(
		public code: LaunchErrorCode,
		message: string,
		public report?: PreflightReport
	) {
		super(message);
		this.name = 'LaunchError';
	}
}

/** Écart minimal entre deux envois consécutifs (limite de débit SMTP). */
export const STAGGER_MS = 3_000;

const newToken = () => randomBytes(32).toString('base64url');

/**
 * Lance une campagne : re-vérifie l'autorisation, mélange les cibles, planifie
 * un créneau d'envoi par cible (d'un coup ou étalé sur la fenêtre choisie, cf.
 * planSends), crée un destinataire (token opaque, heure planifiée) et un job
 * `send-email` dû à cette heure par cible, puis passe la campagne à
 * « sending ». Tout est écrit dans une seule transaction. Chaque créneau doit
 * être couvert par une autorisation, sinon le lancement est refusé.
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

	// Contrôle de pré-lancement : les erreurs bloquent, les avertissements non.
	const report = await runPreflight(campaignId, now);
	if (report?.total === 0) throw new LaunchError('empty_list', 'Liste de cibles vide');
	if (report && !report.ok) {
		const errs = report.items.filter((i) => i.severity === 'error').map((i) => i.message);
		throw new LaunchError('preflight_failed', `Pré-lancement bloqué : ${errs.join(' ')}`, report);
	}

	const auths = await listAuthorizations(campaignId);
	const covered = (t: number) =>
		auths.some((a) => a.validFrom.getTime() <= t && t <= a.validUntil.getTime());
	const timeZone = tenantTimezone(campaign.tenantId);

	return db.transaction(
		(tx) => {
			// Re-lecture dans la transaction : évite un double lancement concurrent.
			const fresh = tx.select().from(campaigns).where(eq(campaigns.id, campaignId)).get();
			if (!fresh || (fresh.status !== 'draft' && fresh.status !== 'scheduled'))
				throw new LaunchError('bad_status', 'Campagne déjà lancée');
			const all = tx.select().from(targets).where(eq(targets.listId, campaign.targetListId)).all();
			// Cibles anonymisées ou à adresse invalide : exclues (cf. pré-lancement).
			const list = all.filter((t) => !t.anonymizedAt && isValidEmail(t.email));
			if (list.length === 0) throw new LaunchError('empty_list', 'Liste de cibles vide');
			const plan = planSends({
				items: list,
				start: now,
				spreadHours: fresh.spreadHours,
				workingHours: fresh.workingHoursOnly
					? {
							startHour: fresh.workStartHour ?? DEFAULT_WORK_START_HOUR,
							endHour: fresh.workEndHour ?? DEFAULT_WORK_END_HOUR
						}
					: null,
				timeZone,
				minGapMs: STAGGER_MS
			});
			const last = plan[plan.length - 1].at;
			if (!plan.every((p) => covered(p.at.getTime())))
				throw new LaunchError(
					'window_unauthorized',
					`L'autorisation ne couvre pas toute la fenêtre d'envoi (dernier envoi prévu le ${formatZoned(last, timeZone)}).`
				);
			for (const { item: t, at } of plan) {
				const rec = tx
					.insert(campaignRecipients)
					.values({
						campaignId,
						targetId: t.id,
						token: newToken(),
						sendStatus: 'pending',
						plannedAt: at
					})
					.returning()
					.get();
				// Même forme de ligne que queue.enqueue, mais dans la transaction.
				tx.insert(jobs)
					.values({
						type: 'send-email',
						payloadJson: JSON.stringify({ recipientId: rec.id }),
						runAt: at,
						status: 'queued'
					})
					.run();
			}
			tx.update(campaigns)
				.set({ status: 'sending', launchError: null })
				.where(eq(campaigns.id, campaignId))
				.run();
			return { recipients: list.length };
		},
		{ behavior: 'immediate' }
	);
}

import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	campaignRecipients,
	campaigns,
	events,
	scenarios,
	sendingProfiles,
	targets
} from '$lib/server/db/schema';
import { canSendCampaign } from '$lib/server/authorization';
import { renderEmail } from '$lib/server/scenarios/render';
import type { RenderCtx } from '$lib/server/scenarios/render';
import {
	registerFailureHandler,
	registerHandler,
	registerRetryHandler
} from '$lib/server/jobs/queue';
import { buildTransport } from '$lib/server/mail/mailer';

/** Les cinq URLs de tracking de l'opérateur injectées dans l'e-mail/la page. */
export type TrackingUrls = RenderCtx['urls'];

/**
 * Construit les cinq URLs de tracking à partir du domaine de la campagne et du
 * jeton opaque du destinataire. Ce sont NOS endpoints (servis par Task 6) :
 * ouverture `/t/o`, clic `/t/c`, soumission `/t/s`, beacon `/t/b`,
 * sensibilisation `/t/a`. Si `base` n'a pas de schéma, on force `https://`.
 */
export function buildTrackingUrls(base: string, token: string): TrackingUrls {
	const root = (/^https?:\/\//i.test(base) ? base : `https://${base}`).replace(/\/+$/, '');
	return {
		open: `${root}/t/o/${token}`,
		click: `${root}/t/c/${token}`,
		submit: `${root}/t/s/${token}`,
		beacon: `${root}/t/b/${token}`,
		awareness: `${root}/t/a/${token}`,
		report: `${root}/t/r/${token}`
	};
}

/**
 * Handler du job `send-email`. Charge destinataire → campagne → scénario →
 * profil d'envoi → cible (le profil est résolu via la campagne : son id ne vient
 * jamais de l'utilisateur). Re-vérifie l'autorisation à l'instant d'envoi
 * (défense TOCTOU, report de Plan 1 / Task 3) : si l'envoi n'est plus autorisé,
 * marque le destinataire `skipped` et sort sans rien envoyer. Sinon rend
 * l'e-mail avec les URLs de tracking, l'envoie en SMTP (From = fromName/
 * fromAddress + en-têtes personnalisés du profil), marque `sent` et enregistre
 * un événement `sent`. Une erreur SMTP est propagée (→ réessai du job).
 */
export async function sendRecipient(recipientId: string): Promise<void> {
	const recipient = db
		.select()
		.from(campaignRecipients)
		.where(eq(campaignRecipients.id, recipientId))
		.get();
	if (!recipient) throw new Error('Destinataire introuvable');

	const campaign = db.select().from(campaigns).where(eq(campaigns.id, recipient.campaignId)).get();
	if (!campaign) throw new Error('Campagne introuvable');

	// Campagne clôturée (arrêtée) avant l'heure planifiée : plus aucun envoi.
	if (campaign.status !== 'sending') {
		db.update(campaignRecipients)
			.set({ sendStatus: 'skipped' })
			.where(
				and(eq(campaignRecipients.id, recipientId), eq(campaignRecipients.sendStatus, 'pending'))
			)
			.run();
		return;
	}

	// Défense TOCTOU : l'autorisation a pu expirer entre le lancement et l'envoi.
	const check = await canSendCampaign(campaign.id, new Date());
	if (!check.ok) {
		db.update(campaignRecipients)
			.set({ sendStatus: 'skipped' })
			.where(eq(campaignRecipients.id, recipientId))
			.run();
		return;
	}

	const scenario = db.select().from(scenarios).where(eq(scenarios.id, campaign.scenarioId)).get();
	if (!scenario) throw new Error('Scénario introuvable');

	// Profil résolu via la campagne (son tenant) : l'id n'est pas fourni par l'utilisateur.
	const profile = db
		.select()
		.from(sendingProfiles)
		.where(eq(sendingProfiles.id, campaign.sendingProfileId))
		.get();
	if (!profile) throw new Error("Profil d'envoi introuvable");

	const target = db.select().from(targets).where(eq(targets.id, recipient.targetId)).get();
	if (!target) throw new Error('Cible introuvable');

	const ctx: RenderCtx = {
		firstName: target.firstName,
		lastName: target.lastName,
		email: target.email,
		awarenessMessage: campaign.awarenessMessage ?? undefined,
		urls: buildTrackingUrls(campaign.trackingDomain, recipient.token)
	};
	const { subject, html } = await renderEmail(scenario, ctx);

	const transport = await buildTransport(profile);
	// headersJson est saisi par l'opérateur et n'est pas validé à la création :
	// un JSON invalide ne doit pas bloquer l'envoi (sinon le destinataire reste
	// « pending » et le job épuise ses réessais). On ignore alors les en-têtes.
	let headers: Record<string, string> | undefined;
	if (profile.headersJson) {
		try {
			headers = JSON.parse(profile.headersJson) as Record<string, string>;
		} catch {
			// Ne jamais journaliser headersJson : il pourrait contenir un secret.
			console.warn(`headersJson invalide pour le profil ${profile.id}, en-têtes ignorés`);
		}
	}
	// Une erreur SMTP remonte ici : le handler la propage → le job sera réessayé.
	await transport.sendMail({
		from: { name: profile.fromName, address: profile.fromAddress },
		to: target.email,
		subject,
		html,
		headers
	});

	db.update(campaignRecipients)
		.set({ sendStatus: 'sent', sentAt: new Date(), sendError: null })
		.where(eq(campaignRecipients.id, recipientId))
		.run();
	db.insert(events).values({ campaignRecipientId: recipientId, type: 'sent' }).run();
}

/** Motif court d'une erreur d'envoi : une ligne, sans identifiants ni jetons, tronqué. */
export function describeSendError(err: unknown): string {
	let msg = err instanceof Error ? err.message : String(err);
	msg = msg.split(/\r?\n/)[0];
	msg = msg
		.replace(/\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi, '$1***@')
		.replace(/\b(pass(?:word)?|pwd|secret|token|api[-_ ]?key|auth)(\s*[=:]\s*)\S+/gi, '$1$2***')
		.replace(/\b(Bearer|Basic)\s+\S+/gi, '$1 ***')
		.replace(/\b[A-Za-z0-9+/_-]{32,}={0,2}/g, '***');
	msg = msg.trim() || 'Erreur inconnue';
	return msg.length > 200 ? `${msg.slice(0, 197)}...` : msg;
}

/**
 * Enregistre le dernier motif (assaini) d'une tentative échouée qui sera
 * réessayée : le destinataire reste « pending », l'interface peut l'afficher.
 */
export function recordRecipientRetry(recipientId: string, err: unknown): void {
	db.update(campaignRecipients)
		.set({ sendError: describeSendError(err) })
		.where(
			and(eq(campaignRecipients.id, recipientId), eq(campaignRecipients.sendStatus, 'pending'))
		)
		.run();
}

/** Marque le destinataire en échec définitif (sauf s'il est déjà envoyé/ignoré). */
export function markRecipientFailed(recipientId: string, err: unknown): void {
	db.update(campaignRecipients)
		.set({ sendStatus: 'failed', sendError: describeSendError(err) })
		.where(
			and(eq(campaignRecipients.id, recipientId), eq(campaignRecipients.sendStatus, 'pending'))
		)
		.run();
}

// Enregistre le handler au chargement du module : la file ne réclame que les
// types ayant un handler, donc ce module doit être importé par le worker.
registerHandler<{ recipientId: string }>('send-email', (payload) =>
	sendRecipient(payload.recipientId)
);
registerFailureHandler<{ recipientId: string }>('send-email', (payload, err) =>
	markRecipientFailed(payload.recipientId, err)
);
registerRetryHandler<{ recipientId: string }>('send-email', (payload, err) =>
	recordRecipientRetry(payload.recipientId, err)
);

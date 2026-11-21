import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { campaignRecipients, campaigns, scenarios } from '$lib/server/db/schema';
import { recordEvent } from '$lib/server/tracking/events';
import { isTrackingLimited } from '$lib/server/tracking/guard';
import type { PageServerLoad } from './$types';

// Rendu entièrement côté serveur, aucun JS client (CSP-friendly).
export const csr = false;

const MESSAGES = {
	fr: {
		title: 'Merci pour votre signalement',
		body: "Votre signalement a bien été pris en compte. Signaler un message suspect est le bon réflexe : merci de contribuer à la sécurité de l'organisation."
	},
	en: {
		title: 'Thank you for your report',
		body: 'Your report has been recorded. Reporting a suspicious message is the right reflex: thank you for helping keep the organisation safe.'
	}
} as const;

/**
 * Lien « Signaler ce message ». Enregistre `reported` (une fois par destinataire)
 * puis affiche un remerciement neutre dans la langue du scénario. Jeton inconnu →
 * 404 (rien enregistré). Les accès automates sont qualifiés comme sur `/t/c`.
 */
export const load: PageServerLoad = async ({ params, request, getClientAddress }) => {
	if (isTrackingLimited(getClientAddress)) throw error(429, 'Trop de requêtes');
	const { token } = params;
	const ok = await recordEvent(token, 'reported', { ua: request.headers.get('user-agent') });
	if (!ok) throw error(404, 'Lien inconnu');

	const row = db
		.select({ locale: scenarios.locale })
		.from(campaignRecipients)
		.innerJoin(campaigns, eq(campaigns.id, campaignRecipients.campaignId))
		.innerJoin(scenarios, eq(scenarios.id, campaigns.scenarioId))
		.where(eq(campaignRecipients.token, token))
		.get();
	const lang = row?.locale?.toLowerCase().startsWith('en') ? 'en' : 'fr';
	return { lang, ...MESSAGES[lang] };
};

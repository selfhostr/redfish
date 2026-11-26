import { error, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { campaignRecipients, campaigns, scenarios, targets } from '$lib/server/db/schema';
import { isValidLandingRedirectUrl } from '$lib/server/scenarios/bundle';
import { renderAwareness } from '$lib/server/scenarios/render';
import type { RenderCtx } from '$lib/server/scenarios/render';
import { recordEvent } from '$lib/server/tracking/events';
import { isTrackingLimited } from '$lib/server/tracking/guard';
import type { PageServerLoad } from './$types';

// Rendu entièrement côté serveur, aucun JS client (CSP-friendly).
export const csr = false;

/**
 * Page de sensibilisation (le débrief pédagogique). Résout d'abord destinataire →
 * campagne → scénario → cible (jeton inconnu → 404, rien enregistré). En mode
 * `redirect`, redirige vers l'URL configurée SANS enregistrer `awareness_viewed`
 * (la cible ne voit aucun débrief). Sinon enregistre `awareness_viewed` puis rend
 * `renderAwareness` avec le message de la campagne.
 */
export const load: PageServerLoad = async ({ params, request, getClientAddress }) => {
	if (isTrackingLimited(getClientAddress)) throw error(429, 'Trop de requêtes');
	const { token } = params;

	const recipient = db
		.select()
		.from(campaignRecipients)
		.where(eq(campaignRecipients.token, token))
		.get();
	if (!recipient) throw error(404, 'Page inconnue');

	const campaign = db.select().from(campaigns).where(eq(campaigns.id, recipient.campaignId)).get();
	if (!campaign) throw error(404, 'Page inconnue');

	const scenario = db.select().from(scenarios).where(eq(scenarios.id, campaign.scenarioId)).get();
	if (!scenario) throw error(404, 'Page inconnue');

	// Mode redirection : aucun débrief, donc aucun `awareness_viewed` enregistré.
	// Validation du schéma au moment de la redirection (défense en profondeur) ;
	// une URL invalide retombe sur le débrief normal.
	if (
		scenario.landingMode === 'redirect' &&
		scenario.landingRedirectUrl &&
		isValidLandingRedirectUrl(scenario.landingRedirectUrl)
	) {
		// URL délibérément externe (site réel / page neutre) : autorisée explicitement.
		throw redirect(302, scenario.landingRedirectUrl, { external: true });
	}

	const recorded = await recordEvent(token, 'awareness_viewed', {
		ua: request.headers.get('user-agent')
	});
	if (!recorded) throw error(404, 'Page inconnue');

	const target = db.select().from(targets).where(eq(targets.id, recipient.targetId)).get();
	if (!target) throw error(404, 'Page inconnue');

	const ctx: RenderCtx = {
		firstName: target.firstName,
		lastName: target.lastName,
		email: target.email,
		awarenessMessage: campaign.awarenessMessage ?? undefined,
		urls: {
			open: `/t/o/${token}`,
			click: `/t/c/${token}`,
			submit: `/t/s/${token}`,
			beacon: `/t/b/${token}`,
			awareness: `/t/a/${token}`,
			report: `/t/r/${token}`,
			attachmentOpen: `/t/ao/${token}`
		}
	};

	return { html: await renderAwareness(scenario, ctx) };
};

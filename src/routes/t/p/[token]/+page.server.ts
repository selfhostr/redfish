import { error, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { campaignRecipients, campaigns, scenarios, targets } from '$lib/server/db/schema';
import { isValidLandingRedirectUrl } from '$lib/server/scenarios/bundle';
import { renderLanding } from '$lib/server/scenarios/render';
import type { RenderCtx } from '$lib/server/scenarios/render';
import { isTrackingLimited } from '$lib/server/tracking/guard';
import type { PageServerLoad } from './$types';

// Rendu entièrement côté serveur, aucun JS client (CSP-friendly) : le seul
// script de la page est le beacon sans corps du gabarit.
export const csr = false;

/**
 * Affiche la page d'atterrissage d'entraînement pour le jeton. Résout
 * destinataire → campagne → scénario → cible, puis rend le gabarit `renderLanding`
 * avec l'action de formulaire `/t/s/[token]`, le beacon `/t/b/[token]` et le
 * prénom de la cible. Afficher la page n'enregistre aucun événement. Jeton
 * inconnu (ou données liées absentes) → 404.
 */
export const load: PageServerLoad = async ({ params, getClientAddress }) => {
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

	// Mode redirection : la cible est renvoyée vers l'URL configurée sans voir la
	// page simulée. Validation du schéma au moment de la redirection (défense en
	// profondeur) ; une URL invalide retombe sur le rendu normal.
	if (
		scenario.landingMode === 'redirect' &&
		scenario.landingRedirectUrl &&
		isValidLandingRedirectUrl(scenario.landingRedirectUrl)
	) {
		// URL délibérément externe (site réel / page neutre) : autorisée explicitement.
		throw redirect(302, scenario.landingRedirectUrl, { external: true });
	}

	const target = db.select().from(targets).where(eq(targets.id, recipient.targetId)).get();
	if (!target) throw error(404, 'Page inconnue');

	const ctx: RenderCtx = {
		firstName: target.firstName,
		lastName: target.lastName,
		email: target.email,
		urls: {
			open: `/t/o/${token}`,
			click: `/t/c/${token}`,
			submit: `/t/s/${token}`,
			beacon: `/t/b/${token}`,
			awareness: `/t/a/${token}`,
			report: `/t/r/${token}`
		}
	};

	return { html: await renderLanding(scenario, ctx) };
};

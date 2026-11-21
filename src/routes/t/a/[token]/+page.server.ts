import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { campaignRecipients, campaigns, scenarios, targets } from '$lib/server/db/schema';
import { renderAwareness } from '$lib/server/scenarios/render';
import type { RenderCtx } from '$lib/server/scenarios/render';
import { recordEvent } from '$lib/server/tracking/events';
import type { PageServerLoad } from './$types';

// Rendu entièrement côté serveur, aucun JS client (CSP-friendly).
export const csr = false;

/**
 * Page de sensibilisation (le débrief pédagogique). Enregistre d'abord
 * `awareness_viewed` pour le jeton, puis résout destinataire → campagne →
 * scénario → cible et rend `renderAwareness` avec le message de la campagne.
 * Jeton inconnu → 404 (rien enregistré).
 */
export const load: PageServerLoad = async ({ params, request }) => {
	const { token } = params;

	const recorded = await recordEvent(token, 'awareness_viewed', {
		ua: request.headers.get('user-agent')
	});
	if (!recorded) throw error(404, 'Page inconnue');

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
			awareness: `/t/a/${token}`
		}
	};

	return { html: await renderAwareness(scenario, ctx) };
};

import { error, redirect } from '@sveltejs/kit';
import { getCampaign } from '$lib/server/campaigns';
import { assertTenantAccess } from '$lib/server/tenant';
import { buildReport } from '$lib/server/reports/report';
import { renderReportHtml } from '$lib/server/reports/print-html';
import type { RequestHandler } from './$types';

// v1 : pas de chromium dans l'image. On renvoie un document HTML autonome,
// optimisé pour l'impression, que l'opérateur enregistre en PDF
// (Imprimer > Enregistrer au format PDF). Pas de script en ligne : la CSP
// stricte le bloquerait (les réponses d'endpoint ne reçoivent pas de nonce).
// Le rendu est factorisé dans renderReportHtml (fonction pure, partagée et
// testée) pour éviter toute divergence avec la vue écran. Un vrai PDF serveur
// (Playwright/chromium) est une étape ultérieure.

export const GET: RequestHandler = async ({ locals, params, url }) => {
	if (!locals.user) throw redirect(303, '/login');
	const campaign = await getCampaign(params.id);
	if (!campaign) throw error(404, 'Campagne introuvable');
	await assertTenantAccess(locals.user, campaign.tenantId);
	const report = await buildReport(campaign.id, {
		anonymize: url.searchParams.get('detail') !== '1'
	});
	return new Response(renderReportHtml(report), {
		headers: {
			'content-type': 'text/html; charset=utf-8',
			'cache-control': 'private, no-store',
			'x-robots-tag': 'noindex'
		}
	});
};

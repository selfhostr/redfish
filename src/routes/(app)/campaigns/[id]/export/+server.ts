import { error } from '@sveltejs/kit';
import { getCampaign } from '$lib/server/campaigns';
import { assertTenantAccess } from '$lib/server/tenant';
import { buildResultsCsv } from '$lib/server/reports/results-export';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) throw error(401, 'Authentification requise');
	const campaign = await getCampaign(params.id);
	if (!campaign) throw error(404, 'Campagne introuvable');
	await assertTenantAccess(locals.user, campaign.tenantId);
	return new Response(buildResultsCsv(campaign.id), {
		headers: {
			'content-type': 'text/csv; charset=utf-8',
			'content-disposition': `attachment; filename="campagne-${campaign.id.replace(/[^A-Za-z0-9_-]/g, '_')}-resultats.csv"`,
			'cache-control': 'no-store',
			'x-content-type-options': 'nosniff'
		}
	});
};

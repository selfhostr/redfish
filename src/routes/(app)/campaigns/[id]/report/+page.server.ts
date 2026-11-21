import { error, redirect } from '@sveltejs/kit';
import { getCampaign } from '$lib/server/campaigns';
import { assertTenantAccess } from '$lib/server/tenant';
import { buildReport } from '$lib/server/reports/report';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params, url }) => {
	if (!locals.user) throw redirect(303, '/login');
	const campaign = await getCampaign(params.id);
	if (!campaign) throw error(404, 'Campagne introuvable');
	await assertTenantAccess(locals.user, campaign.tenantId);
	const anonymize = url.searchParams.get('detail') !== '1';
	return { report: await buildReport(campaign.id, { anonymize }) };
};

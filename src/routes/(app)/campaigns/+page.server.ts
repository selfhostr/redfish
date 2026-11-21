import { redirect } from '@sveltejs/kit';
import { activeTenantId } from '$lib/server/active-tenant';
import { listCampaigns } from '$lib/server/campaigns';
import { assertTenantAccess, tenantTimezone } from '$lib/server/tenant';
import type { PageServerLoad } from './$types';

const STATUSES = ['draft', 'scheduled', 'sending', 'completed'];

export const load: PageServerLoad = async ({ locals, cookies, url }) => {
	if (!locals.user) throw redirect(303, '/login');
	const rawStatus = url.searchParams.get('status') ?? '';
	const status = STATUSES.includes(rawStatus) ? rawStatus : '';
	const q = (url.searchParams.get('q') ?? '').trim().slice(0, 100);
	const filters = { status, q };
	const tenantId = await activeTenantId(locals.user, cookies);
	if (!tenantId) return { campaigns: [], total: 0, filters, timezone: undefined };
	await assertTenantAccess(locals.user, tenantId);
	const all = await listCampaigns(tenantId);
	const needle = q.toLowerCase();
	const campaigns = all.filter(
		(c) => (!status || c.status === status) && (!needle || c.name.toLowerCase().includes(needle))
	);
	return { campaigns, total: all.length, filters, timezone: tenantTimezone(tenantId) };
};

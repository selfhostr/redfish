import { error, redirect } from '@sveltejs/kit';
import { activeTenantId } from '$lib/server/active-tenant';
import { assertTenantAccess, tenantsForUser } from '$lib/server/tenant';
import { overviewForTenant } from '$lib/server/tenant-overview';
import { listCampaigns } from '$lib/server/campaigns';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, cookies, params }) => {
	if (!locals.user) throw redirect(303, '/login');
	await assertTenantAccess(locals.user, params.id);
	const tenant = (await tenantsForUser(locals.user)).find((t) => t.id === params.id);
	if (!tenant) throw error(404, 'Client introuvable');
	const active = await activeTenantId(locals.user, cookies);
	if (active !== tenant.id) {
		// Pas de données du client tant qu'il n'est pas activé (POST /set-tenant).
		return { isActive: false as const, tenant: { id: tenant.id, name: tenant.name } };
	}
	const [overview, campaigns] = await Promise.all([
		overviewForTenant(tenant),
		listCampaigns(tenant.id)
	]);
	return {
		isActive: true as const,
		tenant: { id: tenant.id, name: tenant.name },
		overview,
		latest: campaigns.slice(0, 5).map((c) => ({
			id: c.id,
			name: c.name,
			status: c.status,
			createdAt: c.createdAt
		}))
	};
};

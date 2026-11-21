import { error, fail, redirect } from '@sveltejs/kit';
import { activeTenantId } from '$lib/server/active-tenant';
import { assertTenantAccess, deleteTenant, tenantsForUser, updateTenant } from '$lib/server/tenant';
import { overviewForTenant } from '$lib/server/tenant-overview';
import { audit } from '$lib/server/audit';
import { listCampaigns } from '$lib/server/campaigns';
import { listTimeZones } from '$lib/timezone';
import type { Actions, PageServerLoad } from './$types';

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
		contact: {
			contactName: tenant.contactName,
			contactEmail: tenant.contactEmail,
			notes: tenant.notes,
			timezone: tenant.timezone
		},
		timezones: listTimeZones(),
		overview,
		latest: campaigns.slice(0, 5).map((c) => ({
			id: c.id,
			name: c.name,
			status: c.status,
			createdAt: c.createdAt
		}))
	};
};

export const actions: Actions = {
	update: async ({ request, locals, params }) => {
		if (!locals.user) throw redirect(303, '/login');
		await assertTenantAccess(locals.user, params.id);
		const data = await request.formData();
		const input = {
			contactName: String(data.get('contactName') ?? ''),
			contactEmail: String(data.get('contactEmail') ?? ''),
			notes: String(data.get('notes') ?? ''),
			timezone: String(data.get('timezone') ?? '')
		};
		try {
			await updateTenant(params.id, input);
		} catch (e) {
			if (e && typeof e === 'object' && 'status' in e) throw e;
			return fail(400, {
				contactError: e instanceof Error ? e.message : 'Enregistrement impossible',
				...input
			});
		}
		audit(locals.user, 'client.update', {
			tenantId: params.id,
			targetType: 'tenant',
			targetId: params.id
		});
		return { saved: true as const };
	},
	delete: async ({ request, locals, params }) => {
		if (!locals.user) throw redirect(303, '/login');
		if (locals.user.role !== 'superadmin') throw error(403, 'Accès réservé aux superadmins');
		const tenant = (await tenantsForUser(locals.user)).find((t) => t.id === params.id);
		if (!tenant) throw error(404, 'Client introuvable');
		const confirm = String((await request.formData()).get('confirm') ?? '').trim();
		// Vérification côté serveur : le nom saisi doit correspondre exactement.
		if (confirm !== tenant.name)
			return fail(400, { error: 'Le nom saisi ne correspond pas au nom du client.' });
		await deleteTenant(locals.user, tenant.id);
		audit(locals.user, 'client.delete', {
			tenantId: tenant.id,
			targetType: 'tenant',
			targetId: tenant.id,
			details: { name: tenant.name }
		});
		throw redirect(303, '/tenants');
	}
};

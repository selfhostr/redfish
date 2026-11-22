import { error, fail, redirect } from '@sveltejs/kit';
import { activeTenantId } from '$lib/server/active-tenant';
import { assertTenantAccess, deleteTenant, tenantsForUser, updateTenant } from '$lib/server/tenant';
import { audit } from '$lib/server/audit';
import { listTimeZones } from '$lib/timezone';
import type { Actions, PageServerLoad } from './$types';

/**
 * Paramètres d'un client accessible. Consulter cette page ne change pas le client
 * actif : seul le sélecteur de client (POST /set-tenant) le fait.
 */
export const load: PageServerLoad = async ({ locals, cookies, params, url }) => {
	if (!locals.user) throw redirect(303, '/login');
	await assertTenantAccess(locals.user, params.id);
	const tenant = (await tenantsForUser(locals.user)).find((t) => t.id === params.id);
	if (!tenant) throw error(404, 'Client introuvable');
	const active = await activeTenantId(locals.user, cookies);
	return {
		isActive: active === tenant.id,
		// Arrivée depuis la création du client : propose de continuer vers le tableau de bord.
		welcome: url.searchParams.get('welcome') === '1' && active === tenant.id,
		tenant: { id: tenant.id, name: tenant.name, locale: tenant.locale },
		contact: {
			contactName: tenant.contactName,
			contactEmail: tenant.contactEmail,
			notes: tenant.notes,
			timezone: tenant.timezone
		},
		timezones: listTimeZones()
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

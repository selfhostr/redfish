import { fail, redirect } from '@sveltejs/kit';
import { switchTenant } from '$lib/server/active-tenant';
import { createTenant } from '$lib/server/tenant';
import { tenantOverviews } from '$lib/server/tenant-overview';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(303, '/login');
	// Uniquement les tenants visibles par l'utilisateur (tenantsForUser).
	return { overviews: await tenantOverviews(locals.user) };
};

export const actions: Actions = {
	default: async ({ request, locals, cookies }) => {
		const user = locals.user;
		if (!user) return fail(401, { error: 'Non authentifié', name: '', locale: 'fr' });
		const data = await request.formData();
		const name = String(data.get('name') ?? '').trim();
		const locale = String(data.get('locale') ?? 'fr').trim() || 'fr';
		if (!name) return fail(400, { error: 'Nom requis', name, locale });
		let id: string;
		try {
			const tenant = await createTenant({
				name,
				locale,
				linkUserId: user.role !== 'superadmin' ? user.id : undefined
			});
			id = tenant.id;
			// Le tenant vient d'être créé (et lié à l'utilisateur) : switchTenant revérifie l'accès.
			await switchTenant(user, cookies, id);
		} catch (e) {
			return fail(400, {
				error: e instanceof Error ? e.message : 'Création impossible',
				name,
				locale
			});
		}
		throw redirect(303, `/tenants/${id}`);
	}
};

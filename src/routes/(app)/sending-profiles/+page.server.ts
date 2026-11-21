import { fail, redirect } from '@sveltejs/kit';
import { createSendingProfile, listSendingProfiles } from '$lib/server/sending-profiles';
import { activeTenantId } from '$lib/server/active-tenant';
import { assertTenantAccess } from '$lib/server/tenant';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, cookies }) => {
	if (!locals.user) throw redirect(303, '/login');
	const tenantId = await activeTenantId(locals.user, cookies);
	if (tenantId) await assertTenantAccess(locals.user, tenantId);
	return { profiles: await listSendingProfiles(tenantId) };
};

export const actions: Actions = {
	default: async ({ request, locals, cookies }) => {
		if (!locals.user) throw redirect(303, '/login');
		const user = locals.user;
		const data = await request.formData();
		const str = (k: string) => String(data.get(k) ?? '').trim();
		const name = str('name');
		const host = str('host');
		const port = Number(str('port'));
		const username = str('username');
		const password = String(data.get('password') ?? '');
		const fromName = str('fromName');
		const fromAddress = str('fromAddress');
		const global = data.get('global') === 'on';

		if (!name || !host || !username || !password || !fromName || !fromAddress)
			return fail(400, { error: 'Tous les champs sont requis' });
		if (!Number.isInteger(port) || port < 1 || port > 65535)
			return fail(400, { error: 'Port invalide' });

		let tenantId: string | null = null;
		if (global) {
			if (user.role !== 'superadmin')
				return fail(403, { error: 'Profil global réservé au superadmin' });
		} else {
			tenantId = await activeTenantId(user, cookies);
			if (!tenantId) return fail(400, { error: 'Aucun tenant actif' });
			await assertTenantAccess(user, tenantId);
		}

		await createSendingProfile({
			tenantId,
			name,
			host,
			port,
			username,
			password,
			fromName,
			fromAddress
		});
		return { success: true };
	}
};

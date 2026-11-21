import { fail, redirect } from '@sveltejs/kit';
import { activeTenantId } from '$lib/server/active-tenant';
import { assertTenantAccess } from '$lib/server/tenant';
import { localNext } from '$lib/return-path';
import { createList, listLists } from '$lib/server/targets';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, cookies }) => {
	if (!locals.user) throw redirect(303, '/login');
	const tenantId = await activeTenantId(locals.user, cookies);
	if (!tenantId) return { lists: [] };
	await assertTenantAccess(locals.user, tenantId);
	return { lists: await listLists(tenantId) };
};

export const actions: Actions = {
	default: async ({ request, locals, cookies, url }) => {
		if (!locals.user) throw redirect(303, '/login');
		const tenantId = await activeTenantId(locals.user, cookies);
		if (!tenantId) return fail(400, { error: 'Aucun tenant actif' });
		await assertTenantAccess(locals.user, tenantId);
		const name = String((await request.formData()).get('name') ?? '').trim();
		if (!name) return fail(400, { error: 'Nom requis' });
		const created = await createList(tenantId, name);
		const next = localNext(url.searchParams.get('next'));
		if (next) throw redirect(303, `/lists/${created.id}?next=${encodeURIComponent(next)}`);
		return { success: true };
	}
};

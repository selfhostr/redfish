import { error, fail, redirect } from '@sveltejs/kit';
import { activeTenantId } from '$lib/server/active-tenant';
import { assertTenantAccess } from '$lib/server/tenant';
import { addTarget, getList, importCsv, listTargets } from '$lib/server/targets';
import type { Actions, PageServerLoad } from './$types';

async function context(
	locals: App.Locals,
	cookies: Parameters<typeof activeTenantId>[1],
	listId: string
) {
	if (!locals.user) throw redirect(303, '/login');
	const tenantId = await activeTenantId(locals.user, cookies);
	if (!tenantId) throw error(404, 'Liste introuvable');
	await assertTenantAccess(locals.user, tenantId);
	const list = await getList(listId, tenantId);
	if (!list) throw error(404, 'Liste introuvable');
	return { tenantId, list };
}

export const load: PageServerLoad = async ({ locals, cookies, params }) => {
	const { tenantId, list } = await context(locals, cookies, params.listId);
	return { list, targets: await listTargets(list.id, tenantId) };
};

export const actions: Actions = {
	import: async ({ request, locals, cookies, params }) => {
		const { tenantId, list } = await context(locals, cookies, params.listId);
		const file = (await request.formData()).get('csv');
		if (!(file instanceof File) || file.size === 0)
			return fail(400, { error: 'Fichier CSV requis' });
		const result = await importCsv(list.id, tenantId, await file.text());
		return { result };
	},
	add: async ({ request, locals, cookies, params }) => {
		const { tenantId, list } = await context(locals, cookies, params.listId);
		const data = await request.formData();
		const str = (k: string) => String(data.get(k) ?? '');
		try {
			await addTarget(list.id, tenantId, {
				email: str('email'),
				firstName: str('firstName'),
				lastName: str('lastName'),
				department: str('department'),
				locale: str('locale')
			});
		} catch (e) {
			return fail(400, { error: (e as Error).message });
		}
		return { success: true };
	}
};

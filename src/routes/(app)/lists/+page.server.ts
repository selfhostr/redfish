import { error, fail, redirect } from '@sveltejs/kit';
import { activeTenantId } from '$lib/server/active-tenant';
import { assertTenantAccess } from '$lib/server/tenant';
import { localNext } from '$lib/return-path';
import { audit } from '$lib/server/audit';
import {
	EMAIL_NAME_WARNING,
	countCampaignsUsingList,
	createList,
	deleteOrArchiveList,
	listLists,
	looksLikeEmail,
	restoreList
} from '$lib/server/targets';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, cookies, url }) => {
	if (!locals.user) throw redirect(303, '/login');
	const showArchived = url.searchParams.get('archived') === '1';
	const tenantId = await activeTenantId(locals.user, cookies);
	if (!tenantId) return { lists: [], showArchived, usage: {} as Record<string, number> };
	await assertTenantAccess(locals.user, tenantId);
	const lists = (await listLists(tenantId, showArchived)).map((l) => ({
		id: l.id,
		name: l.name,
		archived: l.archivedAt !== null
	}));
	return {
		lists,
		showArchived,
		usage: Object.fromEntries(lists.map((l) => [l.id, countCampaignsUsingList(l.id)]))
	};
};

async function listContext(locals: App.Locals, cookies: Parameters<typeof activeTenantId>[1]) {
	if (!locals.user) throw redirect(303, '/login');
	const tenantId = await activeTenantId(locals.user, cookies);
	if (!tenantId) throw error(400, 'Aucun tenant actif');
	await assertTenantAccess(locals.user, tenantId);
	return { user: locals.user, tenantId };
}

export const actions: Actions = {
	create: async ({ request, locals, cookies, url }) => {
		if (!locals.user) throw redirect(303, '/login');
		const tenantId = await activeTenantId(locals.user, cookies);
		if (!tenantId) return fail(400, { error: 'Aucun tenant actif' });
		await assertTenantAccess(locals.user, tenantId);
		const name = String((await request.formData()).get('name') ?? '').trim();
		if (!name) return fail(400, { error: 'Nom requis' });
		const created = await createList(tenantId, name);
		const next = localNext(url.searchParams.get('next'));
		if (next) throw redirect(303, `/lists/${created.id}?next=${encodeURIComponent(next)}`);
		return looksLikeEmail(name)
			? { success: true, warning: EMAIL_NAME_WARNING }
			: { success: true };
	},

	/** Liste jamais utilisée : suppression réelle ; utilisée par des campagnes : archivage. */
	delete: async ({ request, locals, cookies }) => {
		const { user, tenantId } = await listContext(locals, cookies);
		const id = String((await request.formData()).get('id') ?? '');
		const outcome = deleteOrArchiveList(id, tenantId);
		if (outcome === 'not_found') return fail(404, { error: 'Liste introuvable' });
		audit(user, outcome === 'deleted' ? 'list.delete' : 'list.archive', {
			tenantId,
			targetType: 'target_list',
			targetId: id
		});
		return { removed: outcome, id };
	},

	restore: async ({ request, locals, cookies }) => {
		const { user, tenantId } = await listContext(locals, cookies);
		const id = String((await request.formData()).get('id') ?? '');
		if (!restoreList(id, tenantId)) return fail(404, { error: 'Liste introuvable' });
		audit(user, 'list.restore', { tenantId, targetType: 'target_list', targetId: id });
		return { restored: true, id };
	}
};

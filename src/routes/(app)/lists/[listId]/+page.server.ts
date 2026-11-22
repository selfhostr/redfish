import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { campaignRecipients, targets } from '$lib/server/db/schema';
import { error, fail, redirect } from '@sveltejs/kit';
import { activeTenantId } from '$lib/server/active-tenant';
import { audit } from '$lib/server/audit';
import { assertTenantAccess } from '$lib/server/tenant';
import {
	EMAIL_NAME_WARNING,
	addTarget,
	countCampaignsUsingList,
	deleteOrArchiveList,
	getList,
	importCsv,
	listTargets,
	looksLikeEmail,
	renameList,
	restoreList
} from '$lib/server/targets';
import { anonymizeTarget, deleteTarget, updateTarget } from '$lib/server/person-data';
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

async function ownedInList(listId: string, tenantId: string, id: string) {
	if (!(await listTargets(listId, tenantId)).some((t) => t.id === id))
		throw new Error('Cible introuvable');
}

export const load: PageServerLoad = async ({ locals, cookies, params }) => {
	const { tenantId, list } = await context(locals, cookies, params.listId);
	const used = new Set(
		db
			.select({ id: campaignRecipients.targetId })
			.from(campaignRecipients)
			.innerJoin(targets, eq(targets.id, campaignRecipients.targetId))
			.where(eq(targets.listId, list.id))
			.all()
			.map((r) => r.id)
	);
	return {
		list,
		usage: countCampaignsUsingList(list.id),
		targets: (await listTargets(list.id, tenantId)).map((t) => ({ ...t, used: used.has(t.id) }))
	};
};

export const actions: Actions = {
	rename: async ({ request, locals, cookies, params }) => {
		const { tenantId, list } = await context(locals, cookies, params.listId);
		const name = String((await request.formData()).get('name') ?? '').trim();
		if (!name) return fail(400, { error: 'Nom requis' });
		renameList(list.id, tenantId, name);
		audit(locals.user, 'list.rename', { tenantId, targetType: 'target_list', targetId: list.id });
		return looksLikeEmail(name)
			? { renamed: true, warning: EMAIL_NAME_WARNING }
			: { renamed: true };
	},
	deleteList: async ({ locals, cookies, params }) => {
		const { tenantId, list } = await context(locals, cookies, params.listId);
		const outcome = deleteOrArchiveList(list.id, tenantId);
		audit(locals.user, outcome === 'deleted' ? 'list.delete' : 'list.archive', {
			tenantId,
			targetType: 'target_list',
			targetId: list.id
		});
		throw redirect(303, '/lists');
	},
	restoreList: async ({ locals, cookies, params }) => {
		const { tenantId, list } = await context(locals, cookies, params.listId);
		restoreList(list.id, tenantId);
		audit(locals.user, 'list.restore', { tenantId, targetType: 'target_list', targetId: list.id });
		return { restored: true };
	},
	import: async ({ request, locals, cookies, params }) => {
		const { tenantId, list } = await context(locals, cookies, params.listId);
		const file = (await request.formData()).get('csv');
		if (!(file instanceof File) || file.size === 0)
			return fail(400, { error: 'Fichier CSV requis' });
		const result = await importCsv(list.id, tenantId, await file.text());
		audit(locals.user, 'targets.import', {
			tenantId,
			targetType: 'target_list',
			targetId: list.id,
			details: { imported: result.imported, skipped: result.skipped }
		});
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
		audit(locals.user, 'targets.add', { tenantId, targetType: 'target_list', targetId: list.id });
		return { success: true };
	},
	update: async ({ request, locals, cookies, params }) => {
		const { tenantId } = await context(locals, cookies, params.listId);
		const data = await request.formData();
		const str = (k: string) => String(data.get(k) ?? '');
		const id = str('id');
		try {
			await ownedInList(params.listId, tenantId, id);
			await updateTarget(tenantId, id, {
				email: str('email'),
				firstName: str('firstName'),
				lastName: str('lastName'),
				department: str('department'),
				locale: str('locale')
			});
		} catch (e) {
			return fail(400, { error: (e as Error).message });
		}
		audit(locals.user, 'targets.update', { tenantId, targetType: 'target', targetId: id });
		return { success: true };
	},
	delete: async ({ request, locals, cookies, params }) => {
		const { tenantId } = await context(locals, cookies, params.listId);
		const id = String((await request.formData()).get('id') ?? '');
		try {
			await ownedInList(params.listId, tenantId, id);
			await deleteTarget(tenantId, id);
		} catch (e) {
			return fail(400, { error: (e as Error).message });
		}
		audit(locals.user, 'targets.delete', { tenantId, targetType: 'target', targetId: id });
		return { success: true };
	},
	anonymize: async ({ request, locals, cookies, params }) => {
		const { tenantId } = await context(locals, cookies, params.listId);
		const id = String((await request.formData()).get('id') ?? '');
		try {
			await ownedInList(params.listId, tenantId, id);
			await anonymizeTarget(tenantId, id);
		} catch (e) {
			return fail(400, { error: (e as Error).message });
		}
		audit(locals.user, 'targets.anonymize', { tenantId, targetType: 'target', targetId: id });
		return { success: true };
	}
};

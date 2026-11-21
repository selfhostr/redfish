import { error, redirect } from '@sveltejs/kit';
import { AUDIT_ACTIONS, listAudit } from '$lib/server/audit';
import { parseUtcDateTime } from '$lib/server/datetime';
import { tenantsForUser } from '$lib/server/tenant';
import type { PageServerLoad } from './$types';

/** Groupes proposés dans le filtre « action » (filtre par préfixe). */
const ACTION_GROUPS = [
	['auth', 'Authentification'],
	['client', 'Clients'],
	['scenario', 'Scénarios'],
	['sending_profile', "Profils d'envoi"],
	['campaign', 'Campagnes'],
	['targets', 'Cibles']
] as const;

/**
 * Journal d'audit, en lecture seule, réservé aux superadmins (403 sinon).
 * Le rôle `operator` n'a pas de pouvoir d'administration : il n'y a pas de
 * vue limitée à un client. Filtres en paramètres d'URL (GET, sans action).
 */
export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) throw redirect(303, '/login');
	if (locals.user.role !== 'superadmin') throw error(403, 'Accès réservé aux superadmins');

	const q = url.searchParams;
	const date = (k: string) => {
		const v = q.get(k)?.trim();
		return v ? parseUtcDateTime(v.length === 10 ? `${v}T00:00` : v) : null;
	};
	const filters = {
		action: q.get('action')?.trim() ?? '',
		actor: q.get('actor')?.trim() ?? '',
		tenantId: q.get('tenant')?.trim() ?? '',
		from: q.get('from')?.trim() ?? '',
		to: q.get('to')?.trim() ?? ''
	};
	const to = date('to');
	// Borne « au » inclusive sur la journée.
	const toExclusive = to && filters.to.length === 10 ? new Date(to.getTime() + 86_400_000) : to;
	const result = listAudit({
		action: filters.action,
		actor: filters.actor,
		tenantId: filters.tenantId,
		from: date('from'),
		to: toExclusive,
		page: Number(q.get('page') ?? 1)
	});
	const tenants = (await tenantsForUser(locals.user)).map((t) => ({ id: t.id, name: t.name }));
	const tenantNames = Object.fromEntries(tenants.map((t) => [t.id, t.name]));
	return {
		filters,
		groups: ACTION_GROUPS.map(([value, label]) => ({ value, label })),
		tenants,
		page: result.page,
		pages: result.pages,
		total: result.total,
		entries: result.entries.map((e) => ({
			id: e.id,
			createdAt: e.createdAt,
			action: e.action,
			label: AUDIT_ACTIONS[e.action as keyof typeof AUDIT_ACTIONS] ?? e.action,
			actor: e.actorEmail ?? (e.actorUserId ? e.actorUserId : 'système / inconnu'),
			tenant: e.tenantId ? (tenantNames[e.tenantId] ?? 'client supprimé') : null,
			target: e.targetType ? `${e.targetType}${e.targetId ? ` ${e.targetId}` : ''}` : null,
			details: e.detailsJson
		}))
	};
};

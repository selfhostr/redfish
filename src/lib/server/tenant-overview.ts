import { listCampaigns } from '$lib/server/campaigns';
import { listSendingProfiles } from '$lib/server/sending-profiles';
import { listLists, listTargets } from '$lib/server/targets';
import { tenantsForUser } from '$lib/server/tenant';
import { campaignFunnel } from '$lib/server/tracking/stats';
import type { Tenant, User } from '$lib/server/db/schema';

export type TenantOverview = {
	id: string;
	name: string;
	locale: string;
	listCount: number;
	recipientCount: number;
	profileCount: number;
	campaignCount: number;
	/** Taux de clic (0..1) de la dernière campagne terminée ; null si aucune ou rien envoyé. */
	lastClickRate: number | null;
	lastCampaign: { id: string; name: string; status: string; createdAt: Date } | null;
};

/**
 * Synthèse d'UN tenant. Toutes les lectures sont filtrées par `tenant.id` ;
 * l'appelant doit avoir vérifié l'accès (c'est le cas via `tenantsForUser`
 * ou `assertTenantAccess`).
 */
export async function overviewForTenant(tenant: Tenant): Promise<TenantOverview> {
	const [lists, campaigns, profiles] = await Promise.all([
		listLists(tenant.id),
		listCampaigns(tenant.id),
		listSendingProfiles(tenant.id)
	]);
	let recipientCount = 0;
	for (const l of lists) recipientCount += (await listTargets(l.id, tenant.id)).length;

	// `listCampaigns` est trié du plus récent au plus ancien.
	const lastDone = campaigns.find((c) => c.status === 'completed');
	let lastClickRate: number | null = null;
	if (lastDone) {
		const f = await campaignFunnel(lastDone.id);
		lastClickRate = f.sent > 0 ? f.clicked / f.sent : null;
	}
	const last = campaigns[0];
	return {
		id: tenant.id,
		name: tenant.name,
		locale: tenant.locale,
		listCount: lists.length,
		recipientCount,
		profileCount: profiles.length,
		campaignCount: campaigns.length,
		lastClickRate,
		lastCampaign: last
			? { id: last.id, name: last.name, status: last.status, createdAt: last.createdAt }
			: null
	};
}

/** Synthèse de chaque tenant visible par l'utilisateur, et d'eux seuls. */
export async function tenantOverviews(user: User): Promise<TenantOverview[]> {
	const visible = await tenantsForUser(user);
	return Promise.all(visible.map(overviewForTenant));
}

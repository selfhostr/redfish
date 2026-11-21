import { redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { scenarios } from '$lib/server/db/schema';
import { activeTenantId } from '$lib/server/active-tenant';
import { listCampaigns } from '$lib/server/campaigns';
import { campaignFunnel, type Funnel } from '$lib/server/tracking/stats';
import { tenantTrend, type TrendPoint } from '$lib/server/tracking/trends';
import { listLists } from '$lib/server/targets';
import { assertTenantAccess } from '$lib/server/tenant';
import { toMeta, type ScenarioMeta } from '$lib/server/scenarios/listing';
import { getQueueHealth } from '$lib/server/jobs/health';
import type { PageServerLoad } from './$types';

/** Cumul des compteurs d'entonnoir sur l'ensemble des campagnes du tenant. */
type Aggregate = {
	recipients: number;
	sent: number;
	opened: number;
	clicked: number;
	pageInteraction: number;
	formSubmitted: number;
	awarenessViewed: number;
	reported: number;
};

const emptyAggregate = (): Aggregate => ({
	recipients: 0,
	sent: 0,
	opened: 0,
	clicked: 0,
	pageInteraction: 0,
	formSubmitted: 0,
	awarenessViewed: 0,
	reported: 0
});

const addFunnel = (a: Aggregate, f: Funnel): Aggregate => ({
	recipients: a.recipients + f.recipients,
	sent: a.sent + f.sent,
	opened: a.opened + f.opened,
	clicked: a.clicked + f.clicked,
	pageInteraction: a.pageInteraction + f.pageInteraction,
	formSubmitted: a.formSubmitted + f.formSubmitted,
	awarenessViewed: a.awarenessViewed + f.awarenessViewed,
	reported: a.reported + f.reported
});

/** Alerte discrète sur la file (agrégats seulement, aucun détail de job), null si tout va bien. */
function queueAlert() {
	const h = getQueueHealth();
	if (!h.needsAttention) return null;
	return {
		workerDown: h.workerDown,
		neverSeen: h.lastHeartbeat === null,
		failedJobs: h.failedJobs,
		oldestDueMinutes: h.oldestDueAgeMs === null ? null : Math.floor(h.oldestDueAgeMs / 60_000)
	};
}

export const load: PageServerLoad = async ({ locals, cookies }) => {
	if (!locals.user) throw redirect(303, '/login');
	// Les jobs ne sont pas rattachés à un tenant : alerte réservée aux superadmins.
	const queue = locals.user.role === 'superadmin' ? queueAlert() : null;
	const tenantId = await activeTenantId(locals.user, cookies);
	if (!tenantId) {
		return {
			queue,
			hasTenant: false,
			listCount: 0,
			campaignCount: 0,
			aggregate: emptyAggregate(),
			rows: [] as DashboardRow[],
			trend: [] as TrendPoint[],
			featured: null as DashboardRow | null
		};
	}
	await assertTenantAccess(locals.user, tenantId);

	const [campaigns, lists] = await Promise.all([listCampaigns(tenantId), listLists(tenantId)]);
	const scenarioById = new Map(
		db
			.select()
			.from(scenarios)
			.all()
			.map((s) => [s.id, s] as const)
	);
	const funnels = await Promise.all(campaigns.map((c) => campaignFunnel(c.id)));

	// `listCampaigns` est trié par date de création décroissante : index 0 = plus récente.
	const rows: DashboardRow[] = campaigns.map((c, i) => ({
		id: c.id,
		name: c.name,
		status: c.status,
		scenario: scenarioById.get(c.scenarioId)?.title ?? 'Scénario inconnu',
		scenarioMeta: scenarioById.has(c.scenarioId) ? toMeta(scenarioById.get(c.scenarioId)!) : null,
		funnel: funnels[i]
	}));

	const aggregate = funnels.reduce(addFunnel, emptyAggregate());

	// Campagne mise en avant : la plus récente terminée, sinon la plus récente
	// ayant envoyé des e-mails, sinon simplement la plus récente.
	let featuredIndex = campaigns.findIndex((c) => c.status === 'completed');
	if (featuredIndex < 0) featuredIndex = funnels.findIndex((f) => f.sent > 0);
	if (featuredIndex < 0 && rows.length > 0) featuredIndex = 0;
	const featured = featuredIndex >= 0 ? rows[featuredIndex] : null;

	return {
		queue,
		hasTenant: true,
		listCount: lists.length,
		campaignCount: campaigns.length,
		aggregate,
		trend: await tenantTrend(tenantId),
		rows,
		featured
	};
};

export type DashboardRow = {
	id: string;
	name: string;
	status: string;
	scenario: string;
	scenarioMeta: ScenarioMeta | null;
	funnel: Funnel;
};

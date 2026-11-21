import { listCampaigns } from '$lib/server/campaigns';
import { campaignFunnel, type Funnel } from './stats';

export type TrendPoint = {
	campaignId: string;
	name: string;
	date: Date;
	sent: number;
	/** Taux humains (0..1) sur les e-mails envoyés. */
	clickRate: number;
	submitRate: number;
	reportRate: number;
};

export function toTrendPoint(
	c: { id: string; name: string; createdAt: Date },
	f: Funnel
): TrendPoint | null {
	if (f.sent <= 0) return null;
	return {
		campaignId: c.id,
		name: c.name,
		date: c.createdAt,
		sent: f.sent,
		clickRate: f.human.clicked / f.sent,
		submitRate: f.human.formSubmitted / f.sent,
		reportRate: f.human.reported / f.sent
	};
}

/** Progression d'un client : campagnes terminées, de la plus ancienne à la plus récente. */
export async function tenantTrend(tenantId: string): Promise<TrendPoint[]> {
	const done = (await listCampaigns(tenantId)).filter((c) => c.status === 'completed');
	const points: TrendPoint[] = [];
	for (const c of done) {
		const p = toTrendPoint(c, await campaignFunnel(c.id));
		if (p) points.push(p);
	}
	return points.sort((a, b) => a.date.getTime() - b.date.getTime());
}

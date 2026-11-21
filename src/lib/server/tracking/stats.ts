import { and, eq, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { campaignRecipients, events } from '$lib/server/db/schema';

export type HumanFunnel = {
	opened: number;
	clicked: number;
	pageInteraction: number;
	formSubmitted: number;
	awarenessViewed: number;
	reported: number;
};
export type Funnel = HumanFunnel & {
	recipients: number;
	sent: number;
	failed: number;
	human: HumanFunnel;
};

const KEYS = {
	opened: 'opened',
	clicked: 'clicked',
	page_interaction: 'pageInteraction',
	form_submitted: 'formSubmitted',
	awareness_viewed: 'awarenessViewed',
	reported: 'reported'
} as const;

/** Entonnoir d'une campagne : destinataires distincts ayant atteint chaque étape. */
export async function campaignFunnel(campaignId: string): Promise<Funnel> {
	const rows = db
		.select({
			type: events.type,
			all: sql<number>`count(distinct ${events.campaignRecipientId})`,
			human: sql<number>`count(distinct case when ${events.isAutomated} = 0 then ${events.campaignRecipientId} end)`
		})
		.from(events)
		.innerJoin(campaignRecipients, eq(events.campaignRecipientId, campaignRecipients.id))
		.where(eq(campaignRecipients.campaignId, campaignId))
		.groupBy(events.type)
		.all();
	const by = new Map(rows.map((r) => [r.type, r]));
	const total = db
		.select({ n: sql<number>`count(*)` })
		.from(campaignRecipients)
		.where(eq(campaignRecipients.campaignId, campaignId))
		.get();
	const failed = db
		.select({ n: sql<number>`count(*)` })
		.from(campaignRecipients)
		.where(
			and(
				eq(campaignRecipients.campaignId, campaignId),
				eq(campaignRecipients.sendStatus, 'failed')
			)
		)
		.get();
	const human: HumanFunnel = {
		opened: 0,
		clicked: 0,
		pageInteraction: 0,
		formSubmitted: 0,
		awarenessViewed: 0,
		reported: 0
	};
	const raw: HumanFunnel = { ...human };
	for (const [type, key] of Object.entries(KEYS)) {
		raw[key] = by.get(type as keyof typeof KEYS)?.all ?? 0;
		human[key] = by.get(type as keyof typeof KEYS)?.human ?? 0;
	}
	return {
		recipients: total?.n ?? 0,
		sent: by.get('sent')?.all ?? 0,
		failed: failed?.n ?? 0,
		...raw,
		human
	};
}

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

/**
 * Étapes d'atteinte (entonnoir monotone) : chaque niveau inclut les niveaux plus
 * profonds. Un clic, une interaction, une soumission ou l'affichage de la page de
 * sensibilisation impliquent une ouverture ; un signalement, non (il peut venir de
 * l'aperçu sans charger le pixel).
 */
const REACH: Record<keyof HumanFunnel, readonly string[]> = {
	opened: ['opened', 'clicked', 'page_interaction', 'form_submitted', 'awareness_viewed'],
	clicked: ['clicked', 'page_interaction', 'form_submitted', 'awareness_viewed'],
	pageInteraction: ['page_interaction', 'form_submitted'],
	formSubmitted: ['form_submitted'],
	awarenessViewed: ['awareness_viewed'],
	reported: ['reported']
};

/** Entonnoir d'une campagne : destinataires distincts ayant atteint AU MOINS chaque étape. */
export async function campaignFunnel(campaignId: string): Promise<Funnel> {
	const rows = db
		.select({
			rid: events.campaignRecipientId,
			type: events.type,
			automated: events.isAutomated
		})
		.from(events)
		.innerJoin(campaignRecipients, eq(events.campaignRecipientId, campaignRecipients.id))
		.where(eq(campaignRecipients.campaignId, campaignId))
		.all();

	const allTypes = new Map<string, Set<string>>();
	const humanTypes = new Map<string, Set<string>>();
	const add = (m: Map<string, Set<string>>, rid: string, t: string) => {
		let s = m.get(rid);
		if (!s) m.set(rid, (s = new Set()));
		s.add(t);
	};
	for (const r of rows) {
		add(allTypes, r.rid, r.type);
		if (!r.automated) add(humanTypes, r.rid, r.type);
	}

	const count = (m: Map<string, Set<string>>, reach: readonly string[]) => {
		let n = 0;
		for (const s of m.values()) if (reach.some((t) => s.has(t))) n++;
		return n;
	};
	const funnelOf = (m: Map<string, Set<string>>): HumanFunnel => ({
		opened: count(m, REACH.opened),
		clicked: count(m, REACH.clicked),
		pageInteraction: count(m, REACH.pageInteraction),
		formSubmitted: count(m, REACH.formSubmitted),
		awarenessViewed: count(m, REACH.awarenessViewed),
		reported: count(m, REACH.reported)
	});

	const raw = funnelOf(allTypes);
	const human = funnelOf(humanTypes);
	const sent = count(allTypes, ['sent']);

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

	return {
		recipients: total?.n ?? 0,
		sent,
		failed: failed?.n ?? 0,
		...raw,
		human
	};
}

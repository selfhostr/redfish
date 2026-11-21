import { and, desc, eq, isNull, or, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { campaigns, sendingProfiles, targetLists } from '$lib/server/db/schema';
import type { Campaign } from '$lib/server/db/schema';
import { canSendCampaign } from './authorization';

export type CampaignInput = {
	tenantId: string;
	name: string;
	scenarioId: string;
	sendingProfileId: string;
	targetListId: string;
	trackingDomain: string;
	awarenessMessage?: string | null;
	scheduledAt?: Date | null;
};

export async function createCampaign(input: CampaignInput): Promise<Campaign> {
	const list = db.select().from(targetLists).where(eq(targetLists.id, input.targetListId)).get();
	if (!list || list.tenantId !== input.tenantId) throw new Error('Liste de cibles invalide');
	const profile = db
		.select()
		.from(sendingProfiles)
		.where(
			and(
				eq(sendingProfiles.id, input.sendingProfileId),
				or(eq(sendingProfiles.tenantId, input.tenantId), isNull(sendingProfiles.tenantId))
			)
		)
		.get();
	if (!profile) throw new Error("Profil d'envoi invalide");
	return db
		.insert(campaigns)
		.values({
			tenantId: input.tenantId,
			name: input.name,
			scenarioId: input.scenarioId,
			sendingProfileId: input.sendingProfileId,
			targetListId: input.targetListId,
			trackingDomain: input.trackingDomain,
			awarenessMessage: input.awarenessMessage ?? null,
			scheduledAt: input.scheduledAt ?? null,
			status: 'draft'
		})
		.returning()
		.get();
}

export async function getCampaign(id: string): Promise<Campaign | null> {
	return db.select().from(campaigns).where(eq(campaigns.id, id)).get() ?? null;
}

export async function listCampaigns(tenantId: string): Promise<Campaign[]> {
	return db
		.select()
		.from(campaigns)
		.where(eq(campaigns.tenantId, tenantId))
		.orderBy(desc(campaigns.createdAt), desc(sql`${campaigns}.rowid`))
		.all();
}

/** Programme une campagne brouillon ; refuse sans autorisation valide. */
export async function scheduleCampaign(
	campaignId: string,
	scheduledAt: Date,
	now: Date = new Date()
): Promise<Campaign> {
	const campaign = await getCampaign(campaignId);
	if (!campaign) throw new Error('Campagne introuvable');
	if (campaign.status !== 'draft') throw new Error('Seul un brouillon peut être programmé');
	const atNow = await canSendCampaign(campaignId, now);
	if (!atNow.ok) throw new Error(`Envoi bloqué : ${atNow.reason}`);
	// L'autorisation doit couvrir l'instant d'envoi programmé.
	const atSend = await canSendCampaign(campaignId, scheduledAt);
	if (!atSend.ok) throw new Error(`Envoi bloqué à l'heure programmée : ${atSend.reason}`);
	return db
		.update(campaigns)
		.set({ status: 'scheduled', scheduledAt })
		.where(and(eq(campaigns.id, campaignId), eq(campaigns.status, 'draft')))
		.returning()
		.get();
}

/** Domaine de tracking de la campagne la plus récente du tenant (null si aucune). */
export async function latestTrackingDomain(tenantId: string): Promise<string | null> {
	const row = db
		.select({ trackingDomain: campaigns.trackingDomain })
		.from(campaigns)
		.where(eq(campaigns.tenantId, tenantId))
		.orderBy(desc(campaigns.createdAt), desc(sql`${campaigns}.rowid`))
		.limit(1)
		.get();
	return row?.trackingDomain ?? null;
}

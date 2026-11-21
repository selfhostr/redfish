import { error } from '@sveltejs/kit';
import { and, desc, eq, isNull, or, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	authorizations,
	campaignRecipients,
	campaigns,
	sendingProfiles,
	targetLists
} from '$lib/server/db/schema';
import type { Campaign, User } from '$lib/server/db/schema';
import { canSendCampaign } from './authorization';
import { deleteJobsForRecipients } from './jobs/queue';
import { assertTenantAccess } from './tenant';

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

/**
 * Supprime DÉFINITIVEMENT une campagne et tout ce qui en dépend : destinataires
 * et événements (cascade FK), autorisations rattachées à la campagne et jobs
 * `send-email` en file visant ses destinataires. Ne touche ni aux cibles, ni aux
 * listes, ni aux profils d'envoi, ni au scénario. Refuse une campagne en cours
 * d'envoi (il faut d'abord l'arrêter ou attendre la fin). 404 si absente, 403 si
 * l'utilisateur n'a pas accès au tenant.
 */
export async function deleteCampaign(user: User, campaignId: string): Promise<void> {
	const campaign = db.select().from(campaigns).where(eq(campaigns.id, campaignId)).get();
	if (!campaign) throw error(404, 'Campagne introuvable');
	await assertTenantAccess(user, campaign.tenantId);
	if (campaign.status === 'sending')
		throw error(
			409,
			"Impossible de supprimer une campagne en cours d'envoi : arrêtez l'envoi ou attendez sa fin."
		);
	db.transaction((tx) => {
		const recipientIds = tx
			.select({ id: campaignRecipients.id })
			.from(campaignRecipients)
			.where(eq(campaignRecipients.campaignId, campaignId))
			.all()
			.map((r) => r.id);
		// Jobs d'abord (pas de FK, référence par payload), puis autorisations
		// (FK NO ACTION sur campaign_id), enfin la campagne (cascade destinataires
		// -> événements).
		deleteJobsForRecipients(tx, recipientIds);
		tx.delete(authorizations).where(eq(authorizations.campaignId, campaignId)).run();
		tx.delete(campaigns).where(eq(campaigns.id, campaignId)).run();
	});
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

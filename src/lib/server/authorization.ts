import { and, desc, eq, gt, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { authorizations, campaigns } from '$lib/server/db/schema';
import type { Authorization } from '$lib/server/db/schema';

export type AuthorizationInput = {
	tenantId: string;
	campaignId: string;
	reference: string;
	validFrom: Date;
	validUntil: Date;
	approvedBy: string;
	filePath?: string | null;
};

export async function createAuthorization(input: AuthorizationInput): Promise<Authorization> {
	if (!input.reference.trim() || !input.approvedBy.trim())
		throw new Error('Référence et approbateur requis');
	if (
		Number.isNaN(input.validFrom.getTime()) ||
		Number.isNaN(input.validUntil.getTime()) ||
		input.validUntil < input.validFrom
	)
		throw new Error('Période de validité invalide');
	const campaign = db.select().from(campaigns).where(eq(campaigns.id, input.campaignId)).get();
	if (!campaign || campaign.tenantId !== input.tenantId)
		throw new Error('Campagne introuvable pour ce tenant');
	return db
		.insert(authorizations)
		.values({ ...input, filePath: input.filePath ?? null })
		.returning()
		.get();
}

export async function listAuthorizations(campaignId: string): Promise<Authorization[]> {
	return db.select().from(authorizations).where(eq(authorizations.campaignId, campaignId)).all();
}

/** Garde bloquante : envoi autorisé seulement avec une autorisation liée valide à `now`. */
export async function canSendCampaign(
	campaignId: string,
	now: Date = new Date()
): Promise<{ ok: boolean; reason?: string }> {
	const auths = await listAuthorizations(campaignId);
	if (auths.length === 0) return { ok: false, reason: 'Aucune autorisation liée à la campagne' };
	const t = now.getTime();
	if (auths.some((a) => a.validFrom.getTime() <= t && t <= a.validUntil.getTime()))
		return { ok: true };
	return { ok: false, reason: 'Autorisation expirée ou pas encore valide' };
}

/**
 * Autorisation la plus récente du tenant dont la fin de validité est encore
 * dans le futur (null si aucune). Sert uniquement à pré-remplir le formulaire.
 */
export async function latestValidAuthorization(
	tenantId: string,
	now: Date = new Date()
): Promise<Authorization | null> {
	return (
		db
			.select()
			.from(authorizations)
			.where(and(eq(authorizations.tenantId, tenantId), gt(authorizations.validUntil, now)))
			.orderBy(desc(authorizations.createdAt), desc(sql`${authorizations}.rowid`))
			.limit(1)
			.get() ?? null
	);
}

import { eq, isNull, or } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { sendingProfiles } from '$lib/server/db/schema';
import type { SendingProfile } from '$lib/server/db/schema';
import { decryptSecret, encryptSecret } from './crypto';

/** Profil d'envoi sans aucun secret (ni mot de passe clair, ni chiffré). */
export type SendingProfileView = Omit<SendingProfile, 'passwordEnc'>;

export type SendingProfileInput = {
	tenantId: string | null;
	name: string;
	host: string;
	port: number;
	username: string;
	password: string;
	fromName: string;
	fromAddress: string;
	headersJson?: string | null;
};

// Liste explicite : un nouveau champ secret ne fuit jamais par défaut.
const viewColumns = {
	id: sendingProfiles.id,
	tenantId: sendingProfiles.tenantId,
	name: sendingProfiles.name,
	host: sendingProfiles.host,
	port: sendingProfiles.port,
	username: sendingProfiles.username,
	fromName: sendingProfiles.fromName,
	fromAddress: sendingProfiles.fromAddress,
	headersJson: sendingProfiles.headersJson,
	createdAt: sendingProfiles.createdAt
};

export async function createSendingProfile(
	input: SendingProfileInput
): Promise<SendingProfileView> {
	const { password, ...rest } = input;
	return db
		.insert(sendingProfiles)
		.values({ ...rest, passwordEnc: encryptSecret(password) })
		.returning(viewColumns)
		.get();
}

/** Profils du tenant + profils globaux. */
export async function listSendingProfiles(tenantId: string | null): Promise<SendingProfileView[]> {
	const where = tenantId
		? or(eq(sendingProfiles.tenantId, tenantId), isNull(sendingProfiles.tenantId))
		: isNull(sendingProfiles.tenantId);
	return db.select(viewColumns).from(sendingProfiles).where(where).all();
}

export async function getSendingProfile(id: string): Promise<SendingProfileView | null> {
	return (
		db.select(viewColumns).from(sendingProfiles).where(eq(sendingProfiles.id, id)).get() ?? null
	);
}

/** Serveur interne uniquement (envoi SMTP). Ne jamais appeler depuis un load/rendu. */
export async function getSmtpPassword(profileId: string): Promise<string> {
	const row = db
		.select({ passwordEnc: sendingProfiles.passwordEnc })
		.from(sendingProfiles)
		.where(eq(sendingProfiles.id, profileId))
		.get();
	if (!row) throw new Error('Profil d’envoi introuvable');
	return decryptSecret(row.passwordEnc);
}

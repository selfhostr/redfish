import { eq, isNull, or } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { sendingProfiles } from '$lib/server/db/schema';
import type { SendingProfile } from '$lib/server/db/schema';
import type { User } from '$lib/server/db/schema';
import { decryptSecret, encryptSecret } from './crypto';
import { audit } from './audit';
import { assertTenantAccess } from './tenant';

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

export type ProfileFields = {
	name: string;
	host: string;
	port: number;
	username: string;
	password: string;
	fromName: string;
	fromAddress: string;
};

/**
 * Lit et valide les champs du formulaire (création et modification).
 * En modification, un mot de passe vide est accepté (= conserver l'actuel).
 */
export function parseProfileFields(
	data: FormData,
	opts: { passwordOptional?: boolean } = {}
): { ok: true; fields: ProfileFields } | { ok: false; error: string } {
	const str = (k: string) => String(data.get(k) ?? '').trim();
	const fields: ProfileFields = {
		name: str('name'),
		host: str('host'),
		port: Number(str('port')),
		username: str('username'),
		password: String(data.get('password') ?? ''),
		fromName: str('fromName'),
		fromAddress: str('fromAddress')
	};
	const { name, host, username, password, fromName, fromAddress, port } = fields;
	if (
		!name ||
		!host ||
		!username ||
		!fromName ||
		!fromAddress ||
		(!password && !opts.passwordOptional)
	)
		return { ok: false, error: 'Tous les champs sont requis' };
	if (!Number.isInteger(port) || port < 1 || port > 65535)
		return { ok: false, error: 'Port invalide' };
	return { ok: true, fields };
}

export type UpdateResult =
	{ ok: true; changed: string[] } | { ok: false; status: number; error: string };

/**
 * Modifie un profil existant. Mêmes règles d'accès qu'à la création : un profil
 * global est réservé au superadmin, un profil de client exige l'accès à ce client.
 * Mot de passe vide = inchangé. Le journal ne contient que les NOMS des champs modifiés.
 */
export async function updateSendingProfile(
	user: User,
	profileId: string,
	fields: ProfileFields
): Promise<UpdateResult> {
	const row = db.select().from(sendingProfiles).where(eq(sendingProfiles.id, profileId)).get();
	if (!row) return { ok: false, status: 404, error: 'Profil introuvable' };
	if (!row.tenantId) {
		if (user.role !== 'superadmin')
			return { ok: false, status: 403, error: 'Profil global réservé au superadmin' };
	} else {
		await assertTenantAccess(user, row.tenantId);
	}

	const changed: string[] = [];
	const set: Partial<typeof sendingProfiles.$inferInsert> = {};
	for (const k of ['name', 'host', 'port', 'username', 'fromName', 'fromAddress'] as const) {
		if (fields[k] !== row[k]) {
			(set as Record<string, unknown>)[k] = fields[k];
			changed.push(k);
		}
	}
	if (fields.password) {
		set.passwordEnc = encryptSecret(fields.password);
		changed.push('password');
	}
	if (changed.length) {
		db.update(sendingProfiles).set(set).where(eq(sendingProfiles.id, profileId)).run();
		audit(user, 'sending_profile.update', {
			tenantId: row.tenantId,
			targetType: 'sending_profile',
			targetId: profileId,
			details: { changed }
		});
	}
	return { ok: true, changed };
}

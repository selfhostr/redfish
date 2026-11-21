import { createHash, randomBytes } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';
import { eq } from 'drizzle-orm';
import { db } from './db';
import { sessions, users, type User } from './db/schema';

/** Nom du cookie portant le jeton de session opérateur. */
export const SESSION_COOKIE = 'redfish_session';

/** Durée de validité d'une session : 30 jours. */
export const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 30;

/**
 * Message d'erreur générique du formulaire de connexion. Identique que
 * l'utilisateur soit inconnu ou que le mot de passe soit faux : aucune
 * énumération de comptes possible.
 */
export const GENERIC_LOGIN_ERROR = 'Identifiants invalides';

/**
 * Empreinte argon2id constante d'un mot de passe factice. Lorsqu'aucun
 * utilisateur ne correspond à l'e-mail saisi, on vérifie malgré tout le mot de
 * passe fourni contre cette empreinte afin que le temps de réponse reste le
 * même que pour un utilisateur existant (pas d'oracle temporel).
 */
export const DUMMY_PASSWORD_HASH =
	'$argon2id$v=19$m=19456,t=2,p=1$EFqGvd4eSC8aleSZDFw33A$boVwYXEZSGagRSeriFOqhHahqB0kFyPYXESQftEY+98';

/** Hache un mot de passe avec argon2id (paramètres par défaut). */
export function hashPassword(pw: string): Promise<string> {
	return hash(pw);
}

/** Vérifie un mot de passe contre une empreinte argon2id. */
export async function verifyPassword(hash: string, pw: string): Promise<boolean> {
	try {
		return await verify(hash, pw);
	} catch {
		// Empreinte malformée : traitée comme un échec, jamais comme une erreur.
		return false;
	}
}

/** SHA-256 (hex) du jeton de session, tel que stocké dans `sessions.id`. */
export function hashToken(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

/** Longueur maximale conservée du User-Agent d'une session. */
const UA_MAX = 200;

/** Intervalle minimal entre deux mises à jour de `lastUsedAt` (limite les écritures). */
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Crée une session pour `userId`. Le jeton brut (32 octets aléatoires en
 * base64url) n'est JAMAIS stocké : seule son empreinte SHA-256 va en base.
 * Le jeton brut n'existe que dans le cookie du client.
 */
export async function createSession(
	userId: string,
	meta: { userAgent?: string | null } = {}
): Promise<{ token: string; expiresAt: Date }> {
	const token = randomBytes(32).toString('base64url');
	const now = new Date();
	const expiresAt = new Date(now.getTime() + SESSION_DURATION_MS);
	db.insert(sessions)
		.values({
			id: hashToken(token),
			userId,
			expiresAt,
			createdAt: now,
			lastUsedAt: now,
			userAgent: meta.userAgent ? meta.userAgent.slice(0, UA_MAX) : null
		})
		.run();
	return { token, expiresAt };
}

/**
 * Valide un jeton de session. Renvoie l'utilisateur associé si la session
 * existe et n'est pas expirée ; sinon `null`. Une session expirée est
 * supprimée au passage.
 */
export async function validateSession(token: string): Promise<{ user: User } | null> {
	const id = hashToken(token);
	const row = db
		.select()
		.from(sessions)
		.innerJoin(users, eq(sessions.userId, users.id))
		.where(eq(sessions.id, id))
		.get();
	if (!row) return null;
	if (row.sessions.expiresAt.getTime() <= Date.now()) {
		db.delete(sessions).where(eq(sessions.id, id)).run();
		return null;
	}
	const last = row.sessions.lastUsedAt?.getTime() ?? 0;
	if (Date.now() - last > TOUCH_INTERVAL_MS) {
		db.update(sessions).set({ lastUsedAt: new Date() }).where(eq(sessions.id, id)).run();
	}
	return { user: row.users };
}

/** Invalide (supprime) la session correspondant au jeton. */
export async function invalidateSession(token: string): Promise<void> {
	db.delete(sessions)
		.where(eq(sessions.id, hashToken(token)))
		.run();
}

/** Crée un utilisateur : hache le mot de passe et insère la ligne. */
export async function createUser(
	email: string,
	password: string,
	role: User['role']
): Promise<User> {
	const passwordHash = await hashPassword(password);
	return db
		.insert(users)
		.values({ email: email.trim().toLowerCase(), passwordHash, role })
		.returning()
		.get();
}

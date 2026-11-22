import { randomBytes } from 'node:crypto';
import { and, desc, eq, isNull, lt, ne } from 'drizzle-orm';
import { db } from './db';
import {
	loginChallenges,
	recoveryCodes,
	sessions,
	users,
	type Session,
	type User
} from './db/schema';
import { hashPassword, hashToken, verifyPassword } from './auth';
import { decryptSecret, encryptSecret } from './crypto';
import { audit } from './audit';
import {
	RECOVERY_CODE_COUNT,
	generateRecoveryCode,
	generateTotpSecret,
	hashRecoveryCode,
	verifyTotp
} from './totp';

/**
 * Sécurité du compte opérateur : sessions actives, changement de mot de passe,
 * 2FA TOTP (secret chiffré via `REDFISH_SECRET_KEY`, codes de secours hachés)
 * et seconde étape de connexion.
 */

/* ---------- Sessions actives ---------- */

export type SessionView = Pick<
	Session,
	'id' | 'createdAt' | 'lastUsedAt' | 'userAgent' | 'expiresAt'
>;

/** Sessions non expirées de l'utilisateur, la plus récemment utilisée d'abord. */
export function listSessions(userId: string): SessionView[] {
	const now = Date.now();
	return db
		.select({
			id: sessions.id,
			createdAt: sessions.createdAt,
			lastUsedAt: sessions.lastUsedAt,
			userAgent: sessions.userAgent,
			expiresAt: sessions.expiresAt
		})
		.from(sessions)
		.where(eq(sessions.userId, userId))
		.orderBy(desc(sessions.lastUsedAt))
		.all()
		.filter((s) => s.expiresAt.getTime() > now);
}

/**
 * Révoque UNE session de l'utilisateur, jamais celle en cours (`currentId`).
 * Le filtre sur `userId` interdit de révoquer la session d'un autre compte.
 */
export function revokeSession(
	userId: string,
	sessionId: string,
	currentId: string | null
): boolean {
	if (!sessionId || sessionId === currentId) return false;
	return (
		db
			.delete(sessions)
			.where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)))
			.run().changes > 0
	);
}

/** Révoque toutes les sessions de l'utilisateur sauf `keepId` ; renvoie le nombre supprimé. */
export function revokeOtherSessions(userId: string, keepId: string | null): number {
	const cond = keepId
		? and(eq(sessions.userId, userId), ne(sessions.id, keepId))
		: eq(sessions.userId, userId);
	return db.delete(sessions).where(cond).run().changes;
}

/* ---------- Mot de passe ---------- */

export const MIN_PASSWORD_LENGTH = 12;

export type ChangePasswordResult =
	{ ok: true; revoked: number } | { ok: false; error: 'bad_current' | 'too_short' | 'same' };

/**
 * Change le mot de passe après vérification de l'actuel, puis invalide toutes
 * les autres sessions : un éventuel détenteur d'une session volée perd l'accès.
 */
export async function changePassword(
	userId: string,
	current: string,
	next: string,
	currentSessionId: string | null
): Promise<ChangePasswordResult> {
	const fresh = db.select().from(users).where(eq(users.id, userId)).get();
	if (!fresh || !(await verifyPassword(fresh.passwordHash, current)))
		return { ok: false, error: 'bad_current' };
	if (next.length < MIN_PASSWORD_LENGTH) return { ok: false, error: 'too_short' };
	if (next === current) return { ok: false, error: 'same' };
	const passwordHash = await hashPassword(next);
	db.update(users).set({ passwordHash }).where(eq(users.id, userId)).run();
	// Une seconde étape ouverte avec l'ancien mot de passe ne doit pas survivre.
	deleteUserChallenges(userId);
	return { ok: true, revoked: revokeOtherSessions(userId, currentSessionId) };
}

/* ---------- Adresse e-mail ---------- */

export type ChangeEmailResult =
	| { ok: true; revoked: number }
	| { ok: false; error: 'invalid' | 'bad_password' | 'same' | 'unavailable' };

const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Change l'adresse de connexion après vérification du mot de passe actuel.
 * L'adresse est normalisée comme à la connexion (trim + minuscules). Le mot de
 * passe est vérifié AVANT le test d'unicité : sans lui, on ne révèle pas si une
 * adresse est déjà prise. Les autres sessions sont fermées, comme pour le mot de passe.
 */
export async function changeEmail(
	userId: string,
	password: string,
	rawEmail: string,
	currentSessionId: string | null
): Promise<ChangeEmailResult> {
	const email = rawEmail.trim().toLowerCase();
	if (email.length > 254 || !EMAIL_FORMAT.test(email)) return { ok: false, error: 'invalid' };
	const fresh = db.select().from(users).where(eq(users.id, userId)).get();
	if (!fresh || !(await verifyPassword(fresh.passwordHash, password)))
		return { ok: false, error: 'bad_password' };
	if (fresh.email === email) return { ok: false, error: 'same' };
	const taken = db.select({ id: users.id }).from(users).where(eq(users.email, email)).get();
	if (taken) return { ok: false, error: 'unavailable' };
	try {
		db.update(users).set({ email }).where(eq(users.id, userId)).run();
	} catch {
		return { ok: false, error: 'unavailable' }; // contrainte UNIQUE (course)
	}
	deleteUserChallenges(userId);
	return { ok: true, revoked: revokeOtherSessions(userId, currentSessionId) };
}

/* ---------- 2FA TOTP ---------- */

function getUser(userId: string): User | undefined {
	return db.select().from(users).where(eq(users.id, userId)).get();
}

/**
 * Démarre (ou redémarre) l'enrôlement : un nouveau secret est généré et stocké
 * CHIFFRÉ ; la 2FA n'est active qu'après confirmation d'un premier code.
 */
export function beginTotpEnrolment(userId: string): string {
	const current = getUser(userId);
	if (!current) throw new Error('Utilisateur introuvable');
	if (current.totpEnabled) throw new Error('La double authentification est déjà active');
	const secret = generateTotpSecret();
	db.update(users)
		.set({ totpSecretEnc: encryptSecret(secret), totpLastStep: null })
		.where(eq(users.id, userId))
		.run();
	return secret;
}

/** Secret TOTP en clair (déchiffré) de l'utilisateur, ou `null`. */
export function getTotpSecret(user: Pick<User, 'totpSecretEnc'>): string | null {
	return user.totpSecretEnc ? decryptSecret(user.totpSecretEnc) : null;
}

/** Remplace les codes de secours ; renvoie les codes en clair (affichés une seule fois). */
function replaceRecoveryCodes(userId: string): string[] {
	const codes = Array.from({ length: RECOVERY_CODE_COUNT }, generateRecoveryCode);
	db.transaction((tx) => {
		tx.delete(recoveryCodes).where(eq(recoveryCodes.userId, userId)).run();
		for (const code of codes)
			tx.insert(recoveryCodes)
				.values({ userId, codeHash: hashRecoveryCode(code) })
				.run();
	});
	return codes;
}

/**
 * Confirme l'enrôlement avec un premier code valide : active la 2FA, génère
 * les codes de secours et révoque les autres sessions (une session ouverte
 * avant la 2FA, éventuellement volée, n'en bénéficie pas). Renvoie `null` si
 * le code est invalide. L'appelant vérifie le mot de passe au préalable.
 */
export function confirmTotpEnrolment(
	userId: string,
	code: string,
	keepSessionId: string | null = null
): string[] | null {
	const current = getUser(userId);
	if (!current || current.totpEnabled || !current.totpSecretEnc) return null;
	const step = verifyTotp(decryptSecret(current.totpSecretEnc), code);
	if (step === null) return null;
	db.update(users).set({ totpEnabled: true, totpLastStep: step }).where(eq(users.id, userId)).run();
	const codes = replaceRecoveryCodes(userId);
	revokeOtherSessions(userId, keepSessionId);
	deleteUserChallenges(userId);
	return codes;
}

/** Nombre de codes de secours encore utilisables. */
export function remainingRecoveryCodes(userId: string): number {
	return db
		.select({ id: recoveryCodes.id })
		.from(recoveryCodes)
		.where(and(eq(recoveryCodes.userId, userId), isNull(recoveryCodes.usedAt)))
		.all().length;
}

/**
 * Déchiffre le secret TOTP ; `null` s'il est illisible (clé `REDFISH_SECRET_KEY`
 * changée ou données altérées). Les codes de secours (hachés, non chiffrés)
 * restent alors utilisables. Aucun secret n'est écrit dans le log.
 */
function readTotpSecret(userId: string, enc: string): string | null {
	try {
		return decryptSecret(enc);
	} catch {
		console.error(
			`2FA : secret TOTP illisible pour l'utilisateur ${userId} (REDFISH_SECRET_KEY modifiée ou données altérées). ` +
				'Utiliser un code de secours ou faire réinitialiser la 2FA par un superadmin.'
		);
		return null;
	}
}

/** `true` si la 2FA est active mais que le secret TOTP ne peut plus être déchiffré. */
export function isTotpUnreadable(userId: string): boolean {
	const current = getUser(userId);
	if (!current?.totpEnabled || !current.totpSecretEnc) return false;
	try {
		decryptSecret(current.totpSecretEnc);
		return false;
	} catch {
		return true;
	}
}

/** Réinitialisation de la 2FA d'un autre utilisateur par un superadmin (journalisée). */
export function resetUserTotp(
	actor: Pick<User, 'id' | 'email' | 'role'>,
	targetId: string
): boolean {
	if (actor.role !== 'superadmin') return false;
	const target = getUser(targetId);
	if (!target?.totpEnabled) return false;
	db.transaction((tx) => {
		tx.update(users)
			.set({ totpEnabled: false, totpSecretEnc: null, totpLastStep: null })
			.where(eq(users.id, targetId))
			.run();
		tx.delete(recoveryCodes).where(eq(recoveryCodes.userId, targetId)).run();
		tx.delete(loginChallenges).where(eq(loginChallenges.userId, targetId)).run();
		tx.delete(sessions).where(eq(sessions.userId, targetId)).run();
	});
	audit(actor, 'auth.2fa.reset', {
		targetType: 'user',
		targetId,
		details: { target: target.email }
	});
	return true;
}

/**
 * Vérifie un second facteur : code TOTP (anti-rejeu via `totpLastStep`) ou
 * code de secours (consommé atomiquement : usage unique même en concurrence).
 */
export function verifySecondFactor(userId: string, code: string): 'totp' | 'recovery' | null {
	const current = getUser(userId);
	if (!current?.totpEnabled || !current.totpSecretEnc) return null;
	const secret = readTotpSecret(userId, current.totpSecretEnc);
	const step = secret ? verifyTotp(secret, code, { lastStep: current.totpLastStep }) : null;
	if (step !== null) {
		db.update(users).set({ totpLastStep: step }).where(eq(users.id, userId)).run();
		return 'totp';
	}
	if (!code.trim()) return null;
	const used = db
		.update(recoveryCodes)
		.set({ usedAt: new Date() })
		.where(
			and(
				eq(recoveryCodes.userId, userId),
				eq(recoveryCodes.codeHash, hashRecoveryCode(code)),
				isNull(recoveryCodes.usedAt)
			)
		)
		.run();
	return used.changes > 0 ? 'recovery' : null;
}

/** Désactive la 2FA : exige le mot de passe ET un second facteur valide. */
export async function disableTotp(
	userId: string,
	password: string,
	code: string,
	keepSessionId: string | null = null
): Promise<{ ok: true } | { ok: false; error: 'bad_password' | 'bad_code' | 'not_enabled' }> {
	const fresh = getUser(userId);
	if (!fresh?.totpEnabled) return { ok: false, error: 'not_enabled' };
	if (!(await verifyPassword(fresh.passwordHash, password)))
		return { ok: false, error: 'bad_password' };
	if (!verifySecondFactor(userId, code)) return { ok: false, error: 'bad_code' };
	db.transaction((tx) => {
		tx.update(users)
			.set({ totpEnabled: false, totpSecretEnc: null, totpLastStep: null })
			.where(eq(users.id, userId))
			.run();
		tx.delete(recoveryCodes).where(eq(recoveryCodes.userId, userId)).run();
		tx.delete(loginChallenges).where(eq(loginChallenges.userId, userId)).run();
		// Changement de sécurité du compte : seule la session courante subsiste.
		const others = keepSessionId
			? and(eq(sessions.userId, userId), ne(sessions.id, keepSessionId))
			: eq(sessions.userId, userId);
		tx.delete(sessions).where(others).run();
	});
	return { ok: true };
}

/* ---------- Seconde étape de connexion ---------- */

/** Cookie portant le jeton de la seconde étape (2FA) de connexion. */
export const CHALLENGE_COOKIE = 'redfish_2fa';
/** Durée de vie d'une seconde étape : 5 minutes. */
export const CHALLENGE_DURATION_MS = 5 * 60 * 1000;
/** Codes erronés tolérés par seconde étape avant de l'invalider. */
export const CHALLENGE_MAX_ATTEMPTS = 5;

/** Crée une seconde étape pour `userId` ; seul le SHA-256 du jeton est stocké. */
export function createLoginChallenge(userId: string): { token: string; expiresAt: Date } {
	const token = randomBytes(32).toString('base64url');
	const expiresAt = new Date(Date.now() + CHALLENGE_DURATION_MS);
	db.insert(loginChallenges)
		.values({ id: hashToken(token), userId, expiresAt })
		.run();
	return { token, expiresAt };
}

/** Utilisateur d'une seconde étape valide, sinon `null` (l'étape périmée est purgée). */
export function getLoginChallenge(token: string): User | null {
	const id = hashToken(token);
	const row = db
		.select()
		.from(loginChallenges)
		.innerJoin(users, eq(loginChallenges.userId, users.id))
		.where(eq(loginChallenges.id, id))
		.get();
	if (!row) return null;
	if (
		row.login_challenges.expiresAt.getTime() <= Date.now() ||
		row.login_challenges.attempts >= CHALLENGE_MAX_ATTEMPTS
	) {
		db.delete(loginChallenges).where(eq(loginChallenges.id, id)).run();
		return null;
	}
	return row.users;
}

/** Comptabilise un code erroné ; supprime la seconde étape au-delà du maximum. */
export function failLoginChallenge(token: string): void {
	const id = hashToken(token);
	const row = db.select().from(loginChallenges).where(eq(loginChallenges.id, id)).get();
	if (!row) return;
	if (row.attempts + 1 >= CHALLENGE_MAX_ATTEMPTS) {
		db.delete(loginChallenges).where(eq(loginChallenges.id, id)).run();
	} else {
		db.update(loginChallenges)
			.set({ attempts: row.attempts + 1 })
			.where(eq(loginChallenges.id, id))
			.run();
	}
}

/**
 * Consomme la seconde étape. Renvoie `false` si elle n'existait plus (déjà
 * consommée par une requête concurrente) : l'appelant ne crée alors pas de session.
 */
export function deleteLoginChallenge(token: string): boolean {
	return (
		db
			.delete(loginChallenges)
			.where(eq(loginChallenges.id, hashToken(token)))
			.run().changes > 0
	);
}

/** Supprime toutes les secondes étapes en cours de l'utilisateur. */
function deleteUserChallenges(userId: string): void {
	db.delete(loginChallenges).where(eq(loginChallenges.userId, userId)).run();
}

/** Purge des sessions et secondes étapes expirées (appelée par le job de rétention). */
export function purgeExpiredAuth(now = new Date()): void {
	db.delete(sessions).where(lt(sessions.expiresAt, now)).run();
	db.delete(loginChallenges).where(lt(loginChallenges.expiresAt, now)).run();
}

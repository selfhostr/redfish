import { beforeEach, expect, test, vi } from 'vitest';

vi.mock('$lib/server/db', async () => {
	const { createTestDb } = await import('./db/test-db');
	return { db: createTestDb() };
});

import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { auditLog, loginChallenges, recoveryCodes, sessions, users } from '$lib/server/db/schema';
import { createSession, createUser, hashToken, validateSession, verifyPassword } from './auth';
import {
	beginTotpEnrolment,
	changePassword,
	confirmTotpEnrolment,
	createLoginChallenge,
	deleteLoginChallenge,
	disableTotp,
	getLoginChallenge,
	listSessions,
	remainingRecoveryCodes,
	revokeOtherSessions,
	revokeSession,
	verifySecondFactor
} from './account';
import { generateTotp } from './totp';

beforeEach(() => {
	vi.stubEnv('REDFISH_SECRET_KEY', 'test-key-for-unit-tests');
	db.delete(auditLog).run();
	db.delete(sessions).run();
	db.delete(users).run();
});

async function enrolled() {
	const user = await createUser('op@example.test', 'old-password-123', 'operator');
	const secret = beginTotpEnrolment(user.id);
	const codes = confirmTotpEnrolment(user.id, generateTotp(secret, Date.now() - 30_000));
	expect(codes).toHaveLength(8);
	return { user, secret, codes: codes! };
}

test('enrôlement : le secret est stocké chiffré, la 2FA active après confirmation', async () => {
	const user = await createUser('op@example.test', 'old-password-123', 'operator');
	const secret = beginTotpEnrolment(user.id);
	let row = db.select().from(users).where(eq(users.id, user.id)).get()!;
	expect(row.totpEnabled).toBe(false);
	expect(row.totpSecretEnc).toMatch(/^v2:/);
	expect(row.totpSecretEnc).not.toContain(secret);
	expect(confirmTotpEnrolment(user.id, '000000')).toBeNull();
	expect(confirmTotpEnrolment(user.id, generateTotp(secret))).toHaveLength(8);
	row = db.select().from(users).where(eq(users.id, user.id)).get()!;
	expect(row.totpEnabled).toBe(true);
	expect(() => beginTotpEnrolment(user.id)).toThrow();
});

test('codes de secours : stockés hachés et à usage unique', async () => {
	const { user, codes } = await enrolled();
	const stored = db.select().from(recoveryCodes).where(eq(recoveryCodes.userId, user.id)).all();
	expect(stored).toHaveLength(8);
	expect(stored.map((s) => s.codeHash)).not.toContain(codes[0]);
	expect(verifySecondFactor(user.id, codes[0])).toBe('recovery');
	expect(verifySecondFactor(user.id, codes[0])).toBeNull();
	expect(remainingRecoveryCodes(user.id)).toBe(7);
	expect(verifySecondFactor(user.id, 'AAAA-BBBB-CCCC-DDDD')).toBeNull();
});

test('code TOTP accepté une seule fois (anti-rejeu)', async () => {
	const { user, secret } = await enrolled();
	const code = generateTotp(secret);
	expect(verifySecondFactor(user.id, code)).toBe('totp');
	expect(verifySecondFactor(user.id, code)).toBeNull();
});

test('désactivation : exige mot de passe ET code', async () => {
	const { user, secret, codes } = await enrolled();
	expect(await disableTotp(user.id, 'wrong', generateTotp(secret))).toEqual({
		ok: false,
		error: 'bad_password'
	});
	expect(await disableTotp(user.id, 'old-password-123', '000000')).toEqual({
		ok: false,
		error: 'bad_code'
	});
	expect(await disableTotp(user.id, 'old-password-123', codes[1])).toEqual({ ok: true });
	const row = db.select().from(users).where(eq(users.id, user.id)).get()!;
	expect(row.totpEnabled).toBe(false);
	expect(row.totpSecretEnc).toBeNull();
	expect(db.select().from(recoveryCodes).all()).toHaveLength(0);
});

test('changement de mot de passe : exige l’actuel et invalide les autres sessions', async () => {
	const user = await createUser('op@example.test', 'old-password-123', 'operator');
	const current = await createSession(user.id);
	const other = await createSession(user.id);
	const currentId = hashToken(current.token);

	expect(await changePassword(user.id, 'nope', 'new-password-456', currentId)).toEqual({
		ok: false,
		error: 'bad_current'
	});
	expect(await changePassword(user.id, 'old-password-123', 'short', currentId)).toEqual({
		ok: false,
		error: 'too_short'
	});
	expect(await validateSession(other.token)).not.toBeNull();

	const res = await changePassword(user.id, 'old-password-123', 'new-password-456', currentId);
	expect(res).toEqual({ ok: true, revoked: 1 });
	expect(await validateSession(current.token)).not.toBeNull();
	expect(await validateSession(other.token)).toBeNull();
	const row = db.select().from(users).where(eq(users.id, user.id)).get()!;
	expect(await verifyPassword(row.passwordHash, 'new-password-456')).toBe(true);
});

test('sessions : liste, révocation limitée à son compte, jamais la session en cours', async () => {
	const a = await createUser('a@example.test', 'pw-aaaaaaaaaaaa', 'operator');
	const b = await createUser('b@example.test', 'pw-bbbbbbbbbbbb', 'operator');
	const a1 = hashToken((await createSession(a.id, { userAgent: 'Firefox' })).token);
	const a2 = hashToken((await createSession(a.id)).token);
	const b1 = hashToken((await createSession(b.id)).token);

	expect(listSessions(a.id)).toHaveLength(2);
	expect(listSessions(a.id).find((s) => s.id === a1)?.userAgent).toBe('Firefox');
	expect(revokeSession(a.id, b1, a1)).toBe(false);
	expect(revokeSession(a.id, a1, a1)).toBe(false);
	expect(revokeSession(a.id, a2, a1)).toBe(true);
	expect(listSessions(b.id)).toHaveLength(1);

	await createSession(a.id);
	expect(revokeOtherSessions(a.id, a1)).toBe(1);
	expect(listSessions(a.id).map((s) => s.id)).toEqual([a1]);
});

test('activation et désactivation de la 2FA : seules la session courante et aucune seconde étape subsistent', async () => {
	const user = await createUser('op@example.test', 'old-password-123', 'operator');
	const current = await createSession(user.id);
	const stolen = await createSession(user.id);
	const currentId = hashToken(current.token);
	const secret = beginTotpEnrolment(user.id);
	expect(
		confirmTotpEnrolment(user.id, generateTotp(secret, Date.now() - 30_000), currentId)
	).toHaveLength(8);
	expect(await validateSession(current.token)).not.toBeNull();
	expect(await validateSession(stolen.token)).toBeNull();

	const again = await createSession(user.id);
	const pending = createLoginChallenge(user.id);
	expect(await disableTotp(user.id, 'old-password-123', generateTotp(secret), currentId)).toEqual({
		ok: true
	});
	expect(await validateSession(current.token)).not.toBeNull();
	expect(await validateSession(again.token)).toBeNull();
	expect(getLoginChallenge(pending.token)).toBeNull();
});

test('changement de mot de passe : les secondes étapes en cours sont invalidées', async () => {
	const { user } = await enrolled();
	const pending = createLoginChallenge(user.id);
	expect(getLoginChallenge(pending.token)?.id).toBe(user.id);
	await changePassword(user.id, 'old-password-123', 'new-password-456', null);
	expect(getLoginChallenge(pending.token)).toBeNull();
	expect(db.select().from(loginChallenges).all()).toHaveLength(0);
});

test('seconde étape : consommation unique', async () => {
	const { user } = await enrolled();
	const pending = createLoginChallenge(user.id);
	expect(deleteLoginChallenge(pending.token)).toBe(true);
	expect(deleteLoginChallenge(pending.token)).toBe(false);
});

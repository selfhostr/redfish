import { beforeEach, expect, test, vi } from 'vitest';

vi.mock('$lib/server/db', async () => {
	const { createTestDb } = await import('$lib/server/db/test-db');
	return { db: createTestDb() };
});

import { db } from '$lib/server/db';
import { auditLog, loginChallenges, sessions, users } from '$lib/server/db/schema';
import { createUser } from '$lib/server/auth';
import { beginTotpEnrolment, confirmTotpEnrolment } from '$lib/server/account';
import { resetRateLimit } from '$lib/server/ratelimit';
import { generateTotp } from '$lib/server/totp';
import { actions as loginActions } from '../+page.server';
import { actions, load } from './+page.server';

beforeEach(() => {
	vi.stubEnv('REDFISH_SECRET_KEY', 'test-key-for-unit-tests');
	db.delete(auditLog).run();
	db.delete(loginChallenges).run();
	db.delete(sessions).run();
	db.delete(users).run();
	resetRateLimit();
});

/** Faux pot de cookies partagé entre les deux étapes. */
function jar() {
	const store = new Map<string, string>();
	return {
		store,
		get: vi.fn((k: string) => store.get(k)),
		set: vi.fn((k: string, v: string) => void store.set(k, v)),
		delete: vi.fn((k: string) => void store.delete(k))
	};
}

function event(url: string, cookies: ReturnType<typeof jar>, fields: Record<string, string>) {
	const body = new FormData();
	for (const [k, v] of Object.entries(fields)) body.set(k, v);
	return {
		request: new Request(url, { method: 'POST', body }),
		cookies,
		locals: { user: null },
		url: new URL(url),
		getClientAddress: () => '203.0.113.9'
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} as any;
}

async function userWith2fa() {
	const user = await createUser('op@example.test', 'correct-horse-1', 'operator');
	const secret = beginTotpEnrolment(user.id);
	confirmTotpEnrolment(user.id, generateTotp(secret, Date.now() - 30_000));
	return { user, secret };
}

/** Première étape (mot de passe) ; la redirection levée en cas de succès est ignorée. */
async function passwordStep(cookies: ReturnType<typeof jar>, email: string, password: string) {
	try {
		await loginActions.default(event('http://localhost/login', cookies, { email, password }));
	} catch {
		// redirect 303 attendu
	}
}

const actionsOf = () =>
	db
		.select()
		.from(auditLog)
		.all()
		.map((e) => e.action);

test('2FA active : le mot de passe mène à la seconde étape, sans session', async () => {
	await userWith2fa();
	const cookies = jar();
	await expect(
		loginActions.default(
			event('http://localhost/login', cookies, {
				email: 'op@example.test',
				password: 'correct-horse-1'
			})
		)
	).rejects.toMatchObject({ status: 303, location: '/login/2fa' });
	expect(cookies.store.has('redfish_2fa')).toBe(true);
	expect(cookies.store.has('redfish_session')).toBe(false);
	expect(db.select().from(sessions).all()).toHaveLength(0);
	expect(actionsOf()).not.toContain('auth.login.success');
});

test('seconde étape : code faux refusé, code juste crée la session', async () => {
	const { secret } = await userWith2fa();
	const cookies = jar();
	await passwordStep(cookies, 'op@example.test', 'correct-horse-1');

	const bad = (await actions.default(
		event('http://localhost/login/2fa', cookies, { code: '000000' })
	)) as { status: number };
	expect(bad.status).toBe(400);
	expect(cookies.store.has('redfish_session')).toBe(false);

	await expect(
		actions.default(event('http://localhost/login/2fa', cookies, { code: generateTotp(secret) }))
	).rejects.toMatchObject({ status: 303, location: '/' });
	expect(cookies.store.has('redfish_session')).toBe(true);
	expect(cookies.store.has('redfish_2fa')).toBe(false);
	expect(db.select().from(sessions).all()).toHaveLength(1);
	expect(db.select().from(loginChallenges).all()).toHaveLength(0);
	expect(actionsOf()).toEqual(expect.arrayContaining(['auth.login.failure', 'auth.login.success']));
});

test('seconde étape invalidée après 5 codes faux', async () => {
	const { secret } = await userWith2fa();
	const cookies = jar();
	await passwordStep(cookies, 'op@example.test', 'correct-horse-1');
	for (let i = 0; i < 5; i++)
		await actions.default(event('http://localhost/login/2fa', cookies, { code: '000000' }));
	// Même avec le bon code, l'étape est perdue : retour à /login.
	await expect(
		actions.default(event('http://localhost/login/2fa', cookies, { code: generateTotp(secret) }))
	).rejects.toMatchObject({ status: 303, location: '/login' });
	expect(db.select().from(sessions).all()).toHaveLength(0);
});

test('accès direct à /login/2fa sans étape en cours : retour à /login', async () => {
	const cookies = jar();
	await expect(
		load({ locals: { user: null }, cookies } as unknown as Parameters<typeof load>[0])
	).rejects.toMatchObject({ status: 303, location: '/login' });
	await expect(
		actions.default(event('http://localhost/login/2fa', cookies, { code: '123456' }))
	).rejects.toMatchObject({ status: 303, location: '/login' });
});

test('connexion sans 2FA et échecs : entrées d’audit écrites, sans e-mail saisi', async () => {
	await createUser('plain@example.test', 'correct-horse-2', 'operator');
	const cookies = jar();
	await loginActions.default(
		event('http://localhost/login', cookies, { email: 'ghost@example.test', password: 'x' })
	);
	await loginActions.default(
		event('http://localhost/login', cookies, { email: 'plain@example.test', password: 'bad' })
	);
	await passwordStep(cookies, 'plain@example.test', 'correct-horse-2');
	const entries = db.select().from(auditLog).all();
	expect(entries.map((e) => e.action)).toEqual([
		'auth.login.failure',
		'auth.login.failure',
		'auth.login.success'
	]);
	expect(entries[0].actorEmail).toBeNull();
	expect(JSON.stringify(entries)).not.toContain('ghost@example.test');
	expect(entries[2].actorEmail).toBe('plain@example.test');
});

test('secret TOTP illisible (clé changée) : message clair, code de secours accepté', async () => {
	const { user } = await userWith2fa();
	const codes = db.select().from(users).all(); // sanity
	expect(codes).toHaveLength(1);
	const { recoveryCodes } = await import('$lib/server/db/schema');
	const { hashRecoveryCode } = await import('$lib/server/totp');
	db.insert(recoveryCodes)
		.values({ userId: user.id, codeHash: hashRecoveryCode('ABCD-EFGH-JKLM-NPQR') })
		.run();
	vi.stubEnv('REDFISH_SECRET_KEY', 'another-key');
	const err = vi.spyOn(console, 'error').mockImplementation(() => {});

	const cookies = jar();
	await passwordStep(cookies, 'op@example.test', 'correct-horse-1');
	const bad = (await actions.default(
		event('http://localhost/login/2fa', cookies, { code: '123456' })
	)) as { status: number; data: { error: string } };
	expect(bad.status).toBe(400);
	expect(bad.data.error).toContain('code de secours');
	expect(bad.data.error).toContain('superadmin');
	expect(err).toHaveBeenCalled();

	await expect(
		actions.default(event('http://localhost/login/2fa', cookies, { code: 'ABCD-EFGH-JKLM-NPQR' }))
	).rejects.toMatchObject({ status: 303, location: '/' });
	expect(cookies.store.has('redfish_session')).toBe(true);
	err.mockRestore();
});

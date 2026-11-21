import { beforeEach, expect, test, vi } from 'vitest';

// Base SQLite en mémoire (migrations appliquées) substituée au client réel,
// pour que toutes les fonctions d'auth (qui utilisent le `db` singleton)
// opèrent sur une base jetable.
vi.mock('$lib/server/db', async () => {
	const { createTestDb } = await import('./db/test-db');
	return { db: createTestDb() };
});

import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { sessions, users } from '$lib/server/db/schema';
import {
	createSession,
	createUser,
	hashPassword,
	invalidateSession,
	validateSession
} from './auth';
import { actions } from '../../routes/login/+page.server';
import { resetRateLimit } from './ratelimit';

beforeEach(() => {
	db.delete(sessions).run();
	db.delete(users).run();
	resetRateLimit();
});

function loginEvent(email: string, password: string) {
	const body = new FormData();
	body.set('email', email);
	body.set('password', password);
	const cookies = { set: vi.fn(), get: vi.fn(), delete: vi.fn() };
	const event = {
		request: new Request('http://localhost/login', { method: 'POST', body }),
		cookies,
		locals: {},
		url: new URL('http://localhost/login'),
		getClientAddress: () => '203.0.113.5'
	};
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return { event: event as any, cookies };
}

test('verifyPassword true only for the right password', async () => {
	const { verifyPassword } = await import('./auth');
	const h = await hashPassword('s3cret');
	expect(await verifyPassword(h, 's3cret')).toBe(true);
	expect(await verifyPassword(h, 'wrong')).toBe(false);
});

test('validateSession returns user for valid token, null for invalid/expired', async () => {
	const user = await createUser('op@example.com', 's3cret', 'operator');
	const { token } = await createSession(user.id);

	const ok = await validateSession(token);
	expect(ok?.user.id).toBe(user.id);
	expect(ok?.user.email).toBe('op@example.com');

	// Jeton inconnu
	expect(await validateSession('bogus-token')).toBeNull();

	// Session expirée : rejetée ET supprimée
	db.update(sessions)
		.set({ expiresAt: new Date(Date.now() - 1000) })
		.run();
	expect(await validateSession(token)).toBeNull();
	expect(db.select().from(sessions).all()).toHaveLength(0);
});

test('invalidateSession removes the session', async () => {
	const user = await createUser('op@example.com', 's3cret', 'operator');
	const { token } = await createSession(user.id);
	expect(await validateSession(token)).not.toBeNull();
	await invalidateSession(token);
	expect(await validateSession(token)).toBeNull();
	expect(db.select().from(sessions).all()).toHaveLength(0);
});

test('login action: unknown user and wrong password give the SAME generic error', async () => {
	await createUser('real@example.com', 'correct-horse', 'operator');

	type Failure = { status: number; data: { error: string } };

	// Utilisateur inconnu
	const unknown = loginEvent('ghost@example.com', 'whatever');
	const r1 = (await actions.default(unknown.event)) as unknown as Failure;

	// Mot de passe erroné
	const wrong = loginEvent('real@example.com', 'wrong-password');
	const r2 = (await actions.default(wrong.event)) as unknown as Failure;

	// Pas d'énumération : statut + message identiques
	expect(r1.status).toBe(400);
	expect(r2.status).toBe(400);
	expect(r1.data.error).toBe(r2.data.error);
	expect(r1.data.error).toBe('Identifiants invalides');

	// Aucun cookie de session n'est posé dans l'un ou l'autre cas
	expect(unknown.cookies.set).not.toHaveBeenCalled();
	expect(wrong.cookies.set).not.toHaveBeenCalled();

	// Aucune session créée en base
	expect(db.select().from(sessions).all()).toHaveLength(0);
});

test('login action: valid credentials create a session and set the cookie', async () => {
	const user = await createUser('real@example.com', 'correct-horse', 'operator');
	const { event, cookies } = loginEvent('real@example.com', 'correct-horse');

	// L'action réussie lève une redirection
	await expect(actions.default(event)).rejects.toMatchObject({ status: 303 });

	expect(cookies.set).toHaveBeenCalledWith(
		'redfish_session',
		expect.any(String),
		expect.objectContaining({ httpOnly: true, sameSite: 'lax', path: '/' })
	);
	const rows = db.select().from(sessions).where(eq(sessions.userId, user.id)).all();
	expect(rows).toHaveLength(1);
});

test('createUser trims and lowercases the email', async () => {
	const user = await createUser('  Op.Case@Example.COM ', 's3cret', 'operator');
	expect(user.email).toBe('op.case@example.com');
});

import { afterEach, beforeEach, expect, test, vi } from 'vitest';

// Base SQLite en mémoire : l'action de connexion (importée plus bas) lit `db`.
vi.mock('$lib/server/db', async () => {
	const { createTestDb } = await import('./db/test-db');
	return { db: createTestDb() };
});

import { rateLimit, resetRateLimit } from './ratelimit';
import { GENERIC_LOGIN_ERROR } from './auth';
import { actions } from '../../routes/login/+page.server';

beforeEach(() => {
	resetRateLimit();
});

afterEach(() => {
	vi.useRealTimers();
});

test('autorise jusqu’à `limit` appels puis refuse, avec retryAfter', () => {
	const opts = { limit: 3, windowMs: 1000 };
	expect(rateLimit('k', opts).ok).toBe(true);
	expect(rateLimit('k', opts).ok).toBe(true);
	expect(rateLimit('k', opts).ok).toBe(true);

	const blocked = rateLimit('k', opts);
	expect(blocked.ok).toBe(false);
	expect(blocked.retryAfter).toBeGreaterThan(0);
});

test('les clés sont indépendantes', () => {
	const opts = { limit: 1, windowMs: 1000 };
	expect(rateLimit('a', opts).ok).toBe(true);
	expect(rateLimit('a', opts).ok).toBe(false);
	// Une autre clé dispose de sa propre fenêtre.
	expect(rateLimit('b', opts).ok).toBe(true);
});

test('la fenêtre se réinitialise après windowMs', () => {
	vi.useFakeTimers();
	const opts = { limit: 2, windowMs: 1000 };
	expect(rateLimit('w', opts).ok).toBe(true);
	expect(rateLimit('w', opts).ok).toBe(true);
	expect(rateLimit('w', opts).ok).toBe(false);

	vi.advanceTimersByTime(1000);
	// Fenêtre expirée : de nouveau autorisé.
	expect(rateLimit('w', opts).ok).toBe(true);
});

/** Construit un faux RequestEvent minimal pour l'action de connexion. */
function loginEvent(email: string, password: string, ip: string) {
	const body = new FormData();
	body.set('email', email);
	body.set('password', password);
	const event = {
		request: new Request('http://localhost/login', { method: 'POST', body }),
		cookies: { set: vi.fn(), get: vi.fn(), delete: vi.fn() },
		locals: {},
		url: new URL('http://localhost/login'),
		getClientAddress: () => ip
	};
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return event as any;
}

test('login : bloqué après N tentatives depuis une même IP, même erreur générique', async () => {
	type Failure = { status: number; data: { error: string } };
	const ip = '198.51.100.9';

	// 5 tentatives autorisées (utilisateur inconnu → erreur générique 400).
	for (let i = 0; i < 5; i++) {
		const r = (await actions.default(loginEvent(`u${i}@x.test`, 'nope', ip))) as unknown as Failure;
		expect(r.status).toBe(400);
		expect(r.data.error).toBe(GENERIC_LOGIN_ERROR);
	}

	// 6e tentative : refusée (429) MAIS avec la MÊME erreur générique
	// (aucune fuite indiquant si le compte existe ou non).
	const blocked = (await actions.default(
		loginEvent('u6@x.test', 'nope', ip)
	)) as unknown as Failure;
	expect(blocked.status).toBe(429);
	expect(blocked.data.error).toBe(GENERIC_LOGIN_ERROR);
});

test('login : le même identifiant est limité même si l’IP change', async () => {
	type Failure = { status: number; data: { error: string } };

	for (let i = 0; i < 5; i++) {
		const r = (await actions.default(
			loginEvent('victim@x.test', 'nope', `203.0.113.${i}`)
		)) as unknown as Failure;
		expect(r.status).toBe(400);
	}

	// 6e tentative sur le même identifiant depuis une IP neuve : bloquée.
	const blocked = (await actions.default(
		loginEvent('victim@x.test', 'nope', '203.0.113.200')
	)) as unknown as Failure;
	expect(blocked.status).toBe(429);
	expect(blocked.data.error).toBe(GENERIC_LOGIN_ERROR);
});

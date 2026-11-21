import { expect, test, vi } from 'vitest';
import { isRedirect } from '@sveltejs/kit';

// On isole le handler de la base : `switchTenant` est remplacé par un espion.
vi.mock('$lib/server/active-tenant', () => ({ switchTenant: vi.fn(async () => {}) }));

import { POST } from './+server';

/** Construit un faux RequestEvent (POST tenantId + redirectTo) pour le handler. */
function makeEvent(redirectTo: string) {
	const body = new FormData();
	body.set('tenantId', 't-123');
	body.set('redirectTo', redirectTo);
	return {
		request: new Request('http://localhost/set-tenant', { method: 'POST', body }),
		locals: { user: { id: 'u-1' } },
		cookies: { set: vi.fn(), get: vi.fn(), delete: vi.fn() }
	};
}

/** Appelle POST et renvoie la redirection lancée. */
async function redirectOf(redirectTo: string): Promise<{ status: number; location: string }> {
	try {
		await POST(makeEvent(redirectTo) as never);
	} catch (e) {
		expect(isRedirect(e)).toBe(true);
		return e as { status: number; location: string };
	}
	throw new Error('aucune redirection lancée');
}

test('un chemin local légitime est conservé', async () => {
	expect((await redirectOf('/campaigns')).location).toBe('/campaigns');
});

test('rejette « /\\evil » (anti-redirection ouverte) → retombe sur /', async () => {
	expect((await redirectOf('/\\evil')).location).toBe('/');
});

test('rejette « //evil » (URL protocole-relative) → retombe sur /', async () => {
	expect((await redirectOf('//evil.test')).location).toBe('/');
});

test('rejette une URL absolue externe → retombe sur /', async () => {
	expect((await redirectOf('https://evil.test')).location).toBe('/');
});

test('rejette « /\\t/evil.com » (tabulation) → retombe sur /', async () => {
	expect((await redirectOf('/\t/evil.com')).location).toBe('/');
});

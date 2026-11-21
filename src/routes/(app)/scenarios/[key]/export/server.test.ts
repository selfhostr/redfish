import { beforeAll, expect, test, vi } from 'vitest';

vi.mock('$lib/server/db', async () => {
	const { createTestDb } = await import('$lib/server/db/test-db');
	return { db: createTestDb() };
});

import type { User } from '$lib/server/db/schema';
import { loadScenarios } from '$lib/server/scenarios/loader';
import { GET } from './+server';

const user = { id: 'u1', email: 'op@example.test', role: 'operator' } as unknown as User;

const run = (key: string, u: User | null = user) =>
	GET({ locals: { user: u }, params: { key } } as unknown as Parameters<typeof GET>[0]);

beforeAll(async () => {
	await loadScenarios('scenarios');
});

test('non authentifié : 401', async () => {
	await expect(run('microsoft365', null)).rejects.toMatchObject({ status: 401 });
});

test('clé inconnue : 404', async () => {
	await expect(run('inconnu')).rejects.toMatchObject({ status: 404 });
});

test('clé connue : JSON du bundle + Content-Disposition en pièce jointe', async () => {
	const res = (await run('microsoft365')) as Response;
	expect(res.headers.get('content-disposition')).toBe(
		'attachment; filename="redfish-scenario-microsoft365.json"'
	);
	const bundle = (await res.json()) as { schemaVersion: number; key: string; email: string };
	expect(bundle.schemaVersion).toBe(1);
	expect(bundle.key).toBe('microsoft365');
	expect(bundle.email.toLowerCase()).toContain('<mjml');
});

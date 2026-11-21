import { beforeAll, expect, test, vi } from 'vitest';

vi.mock('$lib/server/db', async () => {
	const { createTestDb } = await import('$lib/server/db/test-db');
	return { db: createTestDb() };
});

import type { User } from '$lib/server/db/schema';
import { importBundle } from '$lib/server/scenarios/bundle';
import { makeScenarioBundle } from '$lib/server/scenarios/fixtures';
import { GET } from './+server';

const user = { id: 'u1', email: 'op@example.test', role: 'operator' } as unknown as User;

// Le dépôt ne livre plus de scénario : on crée un scénario FIXTURE en base.
const KEY = 'fixture-export';

const run = (key: string, u: User | null = user) =>
	GET({ locals: { user: u }, params: { key } } as unknown as Parameters<typeof GET>[0]);

beforeAll(async () => {
	await importBundle(makeScenarioBundle({ key: KEY, title: 'Fixture export' }));
});

test('non authentifié : 401', async () => {
	await expect(run(KEY, null)).rejects.toMatchObject({ status: 401 });
});

test('clé inconnue : 404', async () => {
	await expect(run('inconnu')).rejects.toMatchObject({ status: 404 });
});

test('clé connue : JSON du bundle + Content-Disposition en pièce jointe', async () => {
	const res = (await run(KEY)) as Response;
	expect(res.headers.get('content-disposition')).toBe(
		`attachment; filename="redfish-scenario-${KEY}.json"`
	);
	const bundle = (await res.json()) as { schemaVersion: number; key: string; email: string };
	expect(bundle.schemaVersion).toBe(1);
	expect(bundle.key).toBe(KEY);
	expect(bundle.email.toLowerCase()).toContain('<mjml');
});

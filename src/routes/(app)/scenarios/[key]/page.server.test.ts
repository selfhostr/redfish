import { beforeAll, expect, test, vi } from 'vitest';

vi.mock('$lib/server/db', async () => {
	const { createTestDb } = await import('$lib/server/db/test-db');
	return { db: createTestDb() };
});

import type { User } from '$lib/server/db/schema';
import { importBundle } from '$lib/server/scenarios/bundle';
import { makeScenarioBundle } from '$lib/server/scenarios/fixtures';
import { load } from './+page.server';

const user = { id: 'u1', email: 'op@example.test', role: 'operator' } as unknown as User;

// Le dépôt ne livre plus de scénario : on crée un scénario FIXTURE en base.
const KEY = 'fixture-preview';

beforeAll(async () => {
	await importBundle(makeScenarioBundle({ key: KEY, title: 'Fixture aperçu' }));
});

const run = (key: string, u: User | null = user) =>
	load({ locals: { user: u }, params: { key } } as unknown as Parameters<typeof load>[0]);

test('non authentifié : redirigé vers /login', async () => {
	await expect(run(KEY, null)).rejects.toMatchObject({ status: 303, location: '/login' });
});

test('clé inconnue : 404', async () => {
	await expect(run('inconnu')).rejects.toMatchObject({ status: 404 });
});

test('clé connue : aperçu présent, sans chemin ni URL de tracking', async () => {
	const data = (await run(KEY)) as {
		scenario: Record<string, unknown>;
		preview: { subject: string; emailHtml: string; landingHtml: string; awarenessHtml: string };
	};
	expect(data.scenario).toMatchObject({ key: KEY, enabled: true });
	expect(Object.keys(data.scenario)).not.toContain('path');
	expect(data.preview.subject).toBeTruthy();
	// Lien de clic converti en élément marqué, sans aucun href.
	expect(data.preview.emailHtml).toContain('data-rf-preview="click"');
	expect(data.preview.emailHtml).not.toMatch(/\shref\s*=/i);
	expect(data.preview.emailHtml).toContain('tabindex="0"');
	expect(data.preview.emailHtml).toContain('role="link"');
	expect(Object.keys(data)).not.toContain('sentinels');
	const json = JSON.stringify(data);
	expect(json).not.toContain('/t/');
	// Pas de clé « path » ni de chemin disque (le HTML peut contenir des <path> SVG).
	expect(json).not.toContain('"path"');
	expect(json).not.toContain(process.cwd());
});

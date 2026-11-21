import { beforeAll, beforeEach, expect, test, vi } from 'vitest';

vi.mock('$lib/server/db', async () => {
	const { createTestDb } = await import('$lib/server/db/test-db');
	return { db: createTestDb() };
});

import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { scenarios } from '$lib/server/db/schema';
import type { User } from '$lib/server/db/schema';
import { getScenario, loadScenarios } from '$lib/server/scenarios/loader';
import { actions } from './+page.server';

const superadmin = { id: 'a1', email: 'admin@example.test', role: 'superadmin' } as unknown as User;
const operator = { id: 'o1', email: 'op@example.test', role: 'operator' } as unknown as User;

const EMAIL =
	'<mjml><mj-body><mj-section><mj-column><mj-text>Bonjour {{firstName}}</mj-text></mj-column></mj-section></mj-body></mjml>';
const LANDING =
	'<!doctype html><html><body><form action="{{submitUrl}}" method="post"><input type="text" /></form>' +
	"<script>navigator.sendBeacon('{{beaconUrl}}');</script></body></html>";
const AWARENESS = '<!doctype html><html><body><div>{{awarenessMessage}}</div></body></html>';

const bundle = {
	schemaVersion: 1,
	key: 'route-import',
	title: 'Test',
	category: 'other',
	locale: 'fr',
	difficulty: 'easy',
	tags: [],
	subject: 'Test',
	fromName: null,
	email: EMAIL,
	landing: LANDING,
	awareness: AWARENESS
};

const runImport = (user: User | null, fields: Record<string, string>) => {
	const fd = new FormData();
	for (const [k, v] of Object.entries(fields)) fd.set(k, v);
	return actions.import({
		request: { formData: async () => fd },
		locals: { user }
	} as unknown as Parameters<typeof actions.import>[0]);
};

beforeAll(async () => {
	await loadScenarios('scenarios');
});

beforeEach(() => {
	db.delete(scenarios).where(eq(scenarios.source, 'imported')).run();
});

test('non authentifié : fail 401', async () => {
	const r = (await runImport(null, { json: JSON.stringify(bundle) })) as { status: number };
	expect(r.status).toBe(401);
});

test('non superadmin : fail 403', async () => {
	const r = (await runImport(operator, { json: JSON.stringify(bundle) })) as { status: number };
	expect(r.status).toBe(403);
});

test('superadmin, JSON valide : import réussi', async () => {
	const r = (await runImport(superadmin, { json: JSON.stringify(bundle) })) as {
		success: boolean;
		key: string;
	};
	expect(r.success).toBe(true);
	expect(r.key).toBe('route-import');
	expect(getScenario('route-import')?.source).toBe('imported');
});

test('superadmin, JSON invalide : fail 400 avec message', async () => {
	const bad = { ...bundle, key: 'route-bad', awareness: '<html><body>rien</body></html>' };
	const r = (await runImport(superadmin, { json: JSON.stringify(bad) })) as {
		status: number;
		data: { error: string };
	};
	expect(r.status).toBe(400);
	expect(r.data.error).toMatch(/awarenessMessage/);
});

test('aucun fichier ni JSON : fail 400', async () => {
	const r = (await runImport(superadmin, {})) as { status: number };
	expect(r.status).toBe(400);
});

import { afterAll, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

vi.mock('$lib/server/db', async () => {
	const { createTestDb } = await import('../db/test-db');
	return { db: createTestDb() };
});

import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { scenarios } from '$lib/server/db/schema';
import { makeScenarioBundle, makeScenarioRoot, writeScenarioPackage } from './fixtures';
import { getScenario, loadScenarios, parseManifest } from './loader';
import { importBundle } from './bundle';

const VALID = [
	'key: demo',
	'title: Démo',
	'category: credential-harvest',
	'subject: Bonjour',
	'templates:',
	'  email: email.mjml',
	'  landing: landing.html',
	'  awareness: awareness.html'
].join('\n');

/** Dossier de paquets fixture (le dépôt ne livre plus aucun scénario). */
let root: string;

beforeAll(async () => {
	root = await makeScenarioRoot();
	await writeScenarioPackage(root, { key: 'fixture-a', title: 'Fixture A' });
	await writeScenarioPackage(root, { key: 'fixture-b', title: 'Fixture B' });
});

afterAll(async () => {
	await rm(root, { recursive: true, force: true });
});

beforeEach(() => {
	db.delete(scenarios).run();
});

test('parseManifest throws when key is missing', () => {
	const yaml = VALID.replace('key: demo\n', '');
	expect(() => parseManifest(yaml)).toThrow();
});

test('parseManifest throws when subject is missing', () => {
	const yaml = VALID.replace('subject: Bonjour\n', '');
	expect(() => parseManifest(yaml)).toThrow();
});

test('parseManifest throws when templates is missing', () => {
	const yaml = 'key: demo\nsubject: Bonjour\n';
	expect(() => parseManifest(yaml)).toThrow();
});

test('parseManifest returns a typed manifest for a valid document', () => {
	const m = parseManifest(`${VALID}\ntags:\n  - a\n  - b`);
	expect(m.key).toBe('demo');
	expect(m.subject).toBe('Bonjour');
	expect(m.tags).toEqual(['a', 'b']);
	expect(m.templates.email).toBe('email.mjml');
});

test('loadScenarios upserts a fixture package found on disk', async () => {
	const count = await loadScenarios(root);
	expect(count).toBe(2);

	const s = getScenario('fixture-a');
	expect(s).toBeDefined();
	expect(s?.key).toBe('fixture-a');
	expect(s?.category).toBeTruthy();
	expect(s?.path).toContain('fixture-a');
	expect(s?.enabled).toBe(true);
});

test('loadScenarios is idempotent — upserts by key, no duplicates', async () => {
	await loadScenarios(root);
	await loadScenarios(root);
	const rows = db.select().from(scenarios).where(eq(scenarios.key, 'fixture-a')).all();
	expect(rows.length).toBe(1);
});

test('loadScenarios returns 0 and does not throw when the directory is absent', async () => {
	const missing = join(tmpdir(), `redfish-missing-${Date.now()}`);
	await expect(loadScenarios(missing)).resolves.toBe(0);
});

test('loadScenarios returns 0 for an empty directory', async () => {
	const empty = await mkdtemp(join(tmpdir(), 'redfish-empty-'));
	try {
		await expect(loadScenarios(empty)).resolves.toBe(0);
	} finally {
		await rm(empty, { recursive: true, force: true });
	}
});

test('loadScenarios does not delete imported scenarios (source != builtin)', async () => {
	await importBundle(makeScenarioBundle({ key: 'imported-keep' }));
	await loadScenarios(root);
	const kept = getScenario('imported-keep');
	expect(kept).toBeDefined();
	expect(kept?.source).toBe('imported');
	// Les builtin du dossier fixture sont bien chargés à côté de l'importé.
	expect(getScenario('fixture-a')).toBeDefined();
});

test('getScenario returns undefined for an unknown key', () => {
	expect(getScenario('does-not-exist')).toBeUndefined();
});

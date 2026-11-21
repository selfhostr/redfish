import { afterAll, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { rm } from 'node:fs/promises';

// Comme loader.test / render.test : base SQLite en mémoire à la place de la vraie.
vi.mock('$lib/server/db', async () => {
	const { createTestDb } = await import('../db/test-db');
	return { db: createTestDb() };
});

import { db } from '$lib/server/db';
import { scenarios } from '$lib/server/db/schema';
import { makeScenarioRoot, writeScenarioPackage } from './fixtures';
import { getScenario, loadScenarios } from './loader';

/**
 * Le dépôt ne livre plus aucun scénario : ce test écrit un paquet FIXTURE neutre
 * et représentatif sur disque, puis vérifie son chargement et ses invariants
 * « zéro capture » et sensibilisation (les scénarios créés/importés sont, eux,
 * validés par `importBundle`).
 */
const KEY = 'fixture-catalog';
let root: string;
let pkgDir: string;

beforeAll(async () => {
	root = await makeScenarioRoot();
	pkgDir = await writeScenarioPackage(root, { key: KEY, title: 'Fixture', locale: 'fr' });
});

afterAll(async () => {
	await rm(root, { recursive: true, force: true });
});

beforeEach(() => {
	db.delete(scenarios).run();
});

test('loadScenarios enregistre le paquet fixture présent sur disque', async () => {
	const count = await loadScenarios(root);
	expect(count).toBeGreaterThanOrEqual(1);
	const s = getScenario(KEY);
	expect(s, KEY).toBeDefined();
	expect(s?.key).toBe(KEY);
	expect(s?.locale).toBe('fr');
	expect(s?.enabled).toBe(true);
	expect(s?.path).toContain(KEY);
});

test('zéro capture : la page poste vers {{submitUrl}}, sans champ nommé', async () => {
	const landing = await readFile(join(pkgDir, 'landing.html'), 'utf8');

	// Le <form> poste vers l'URL de soumission de l'opérateur (aucune capture).
	const action = landing.match(/<form[^>]*action="([^"]*)"/i);
	expect(action?.[1]).toBe('{{submitUrl}}');

	// Aucun <input> ne porte d'attribut `name` lu côté serveur (visuel seul).
	expect(/<input[^>]*\bname=/i.test(landing)).toBe(false);

	// Beacon d'interaction vers {{beaconUrl}} SANS corps (aucune saisie envoyée).
	expect(/sendBeacon\(\s*['"]\{\{beaconUrl\}\}['"]\s*\)/.test(landing)).toBe(true);
});

test('la page de sensibilisation contient {{awarenessMessage}}', async () => {
	const awareness = await readFile(join(pkgDir, 'awareness.html'), 'utf8');
	expect(awareness).toContain('{{awarenessMessage}}');
});

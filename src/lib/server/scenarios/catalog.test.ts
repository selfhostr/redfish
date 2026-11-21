import { beforeEach, expect, test, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

// Comme loader.test / render.test : base SQLite en mémoire à la place de la vraie.
vi.mock('$lib/server/db', async () => {
	const { createTestDb } = await import('../db/test-db');
	return { db: createTestDb() };
});

import { db } from '$lib/server/db';
import { scenarios } from '$lib/server/db/schema';
import { getScenario, loadScenarios } from './loader';

/** Les quatre paquets du catalogue Suisse/Valais livrés par cette tâche. */
const KEYS = ['admin-valais', 'livraison-colis', 'facture-qr', 'banque-regionale', 'groupe-mutuel', 'swisscom', 'microsoft-teams'];

beforeEach(() => {
	db.delete(scenarios).run();
});

test('loadScenarios enregistre les quatre scénarios du catalogue Suisse/Valais', async () => {
	await loadScenarios();
	for (const key of KEYS) {
		const s = getScenario(key);
		expect(s, key).toBeDefined();
		expect(s?.key).toBe(key);
		expect(s?.locale).toBe('fr');
		expect(s?.enabled).toBe(true);
		expect(s?.path).toContain(key);
	}
});

test('zéro capture : chaque page poste vers {{submitUrl}}, sans champ nommé', async () => {
	await loadScenarios();
	for (const key of KEYS) {
		const s = getScenario(key);
		expect(s, key).toBeDefined();
		const landing = await readFile(join(s!.path, 'landing.html'), 'utf8');

		// Le <form> poste vers l'URL de soumission de l'opérateur (aucune capture).
		const action = landing.match(/<form[^>]*action="([^"]*)"/i);
		expect(action?.[1], key).toBe('{{submitUrl}}');

		// Aucun <input> ne porte d'attribut `name` lu côté serveur (visuel seul).
		expect(/<input[^>]*\bname=/i.test(landing), key).toBe(false);

		// Beacon d'interaction vers {{beaconUrl}} SANS corps (aucune saisie envoyée).
		expect(/sendBeacon\(\s*['"]\{\{beaconUrl\}\}['"]\s*\)/.test(landing), key).toBe(true);
	}
});

test('chaque page de sensibilisation contient {{awarenessMessage}}', async () => {
	await loadScenarios();
	for (const key of KEYS) {
		const s = getScenario(key);
		expect(s, key).toBeDefined();
		const awareness = await readFile(join(s!.path, 'awareness.html'), 'utf8');
		expect(awareness, key).toContain('{{awarenessMessage}}');
	}
});

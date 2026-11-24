import { beforeEach, expect, test, vi } from 'vitest';

vi.mock('$lib/server/db', async () => {
	const { createTestDb } = await import('$lib/server/db/test-db');
	return { db: createTestDb() };
});

import { db } from '$lib/server/db';
import { scenarios } from '$lib/server/db/schema';
import type { User } from '$lib/server/db/schema';
import { getScenario } from '$lib/server/scenarios/loader';
import { importBundle, BUNDLE_SCHEMA_VERSION } from '$lib/server/scenarios/bundle';
import { parseTags } from '$lib/scenario-labels';
import {
	SKELETON_AWARENESS,
	SKELETON_EMAIL,
	SKELETON_LANDING,
	SKELETON_SUBJECT
} from '$lib/scenarios/skeletons';
import { actions, load } from './+page.server';

const superadmin = { id: 'a1', email: 'admin@example.test', role: 'superadmin' } as unknown as User;
const operator = { id: 'o1', email: 'op@example.test', role: 'operator' } as unknown as User;

const KEY = 'mon-scenario';

/** Crée un scénario importé (donc éditable) via le même flux que l'opérateur. */
const seedImported = (key = KEY) =>
	importBundle({
		schemaVersion: BUNDLE_SCHEMA_VERSION,
		key,
		title: 'Titre initial',
		category: 'other',
		locale: 'fr',
		difficulty: 'easy',
		tags: ['interne', 'rh'],
		subject: SKELETON_SUBJECT,
		fromName: 'Service informatique',
		email: SKELETON_EMAIL,
		landing: SKELETON_LANDING,
		awareness: SKELETON_AWARENESS
	});

const editFields = (overrides: Record<string, string> = {}): Record<string, string> => ({
	key: KEY,
	title: 'Titre initial',
	category: 'other',
	locale: 'fr',
	difficulty: 'easy',
	subject: SKELETON_SUBJECT,
	fromName: 'Service informatique',
	email: SKELETON_EMAIL,
	landing: SKELETON_LANDING,
	awareness: SKELETON_AWARENESS,
	...overrides
});

const runLoad = (user: User | null, key: string) =>
	load({ locals: { user }, params: { key } } as unknown as Parameters<typeof load>[0]);

const runEdit = (user: User | null, key: string, fields: Record<string, string>) => {
	const fd = new FormData();
	for (const [k, val] of Object.entries(fields)) fd.set(k, val);
	return actions.default({
		request: { formData: async () => fd },
		locals: { user },
		params: { key }
	} as unknown as Parameters<typeof actions.default>[0]);
};

beforeEach(() => {
	db.delete(scenarios).run();
});

test('load : non authentifié -> redirect /login', async () => {
	await expect(runLoad(null, KEY)).rejects.toMatchObject({ status: 303, location: '/login' });
});

test('load : opérateur -> 403', async () => {
	await seedImported();
	await expect(runLoad(operator, KEY)).rejects.toMatchObject({ status: 403 });
});

test('load : scénario introuvable -> 404', async () => {
	await expect(runLoad(superadmin, 'inconnu')).rejects.toMatchObject({ status: 404 });
});

test('load : superadmin + scénario importé -> valeurs pré-remplies', async () => {
	await seedImported();
	const data = (await runLoad(superadmin, KEY)) as {
		values: { key: string; subject: string; fromName: string; landing: string };
		tags: string[];
	};
	expect(data.values.key).toBe(KEY);
	expect(data.values.fromName).toBe('Service informatique');
	expect(data.values.landing).toContain("navigator.sendBeacon('{{beaconUrl}}')");
	expect(data.tags).toEqual(['interne', 'rh']);
});

test('action : opérateur -> fail 403', async () => {
	await seedImported();
	const r = (await runEdit(operator, KEY, editFields())) as { status: number };
	expect(r.status).toBe(403);
});

test('action : non authentifié -> fail 401', async () => {
	await seedImported();
	const r = (await runEdit(null, KEY, editFields())) as { status: number };
	expect(r.status).toBe(401);
});

test('action : met à jour le contenu en place (même clé) + préserve les tags', async () => {
	await seedImported();
	const newSubject = 'Nouveau sujet {{firstName}}';
	await expect(
		runEdit(superadmin, KEY, editFields({ subject: newSubject, fromName: 'Direction' }))
	).rejects.toMatchObject({ status: 303, location: `/scenarios/${KEY}` });

	const row = getScenario(KEY);
	expect(row?.source).toBe('imported');
	expect(row?.subject).toBe(newSubject);
	expect(row?.fromName).toBe('Direction');
	// Les tags existants ne sont pas écrasés par l'édition.
	expect(parseTags(row?.tagsJson)).toEqual(['interne', 'rh']);
});

test('action : la clé soumise est ignorée (mise à jour à params.key)', async () => {
	await seedImported();
	await expect(
		runEdit(superadmin, KEY, editFields({ key: 'autre-cle', title: 'Renommé' }))
	).rejects.toMatchObject({ status: 303, location: `/scenarios/${KEY}` });

	expect(getScenario('autre-cle')).toBeUndefined();
	expect(getScenario(KEY)?.title).toBe('Renommé');
});

test('action : contenu invalide -> fail 400 + valeurs conservées', async () => {
	await seedImported();
	const landing = SKELETON_LANDING.replace('type="text"', 'type="text" name="user"');
	const r = (await runEdit(superadmin, KEY, editFields({ landing }))) as {
		status: number;
		data: { error: string; values: { key: string } };
	};
	expect(r.status).toBe(400);
	expect(r.data.error).toMatch(/name/i);
	// La clé renvoyée pour le ré-affichage reste celle du scénario.
	expect(r.data.values.key).toBe(KEY);
});

test('load : scénario livré (builtin) -> 403 lecture seule', async () => {
	db.insert(scenarios)
		.values({
			key: 'livre',
			title: 'Scénario livré',
			category: 'other',
			locale: 'fr',
			difficulty: 'easy',
			tagsJson: '[]',
			source: 'builtin',
			path: 'scenarios/livre',
			enabled: true
		})
		.run();
	await expect(runLoad(superadmin, 'livre')).rejects.toMatchObject({ status: 403 });
});

test('action : scénario livré (builtin) -> 403 lecture seule', async () => {
	db.insert(scenarios)
		.values({
			key: 'livre',
			title: 'Scénario livré',
			category: 'other',
			locale: 'fr',
			difficulty: 'easy',
			tagsJson: '[]',
			source: 'builtin',
			path: 'scenarios/livre',
			enabled: true
		})
		.run();
	await expect(runEdit(superadmin, 'livre', editFields({ key: 'livre' }))).rejects.toMatchObject({
		status: 403
	});
});

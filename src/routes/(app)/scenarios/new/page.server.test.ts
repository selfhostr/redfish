import { beforeEach, expect, test, vi } from 'vitest';

vi.mock('$lib/server/db', async () => {
	const { createTestDb } = await import('$lib/server/db/test-db');
	return { db: createTestDb() };
});

import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { scenarios } from '$lib/server/db/schema';
import type { User } from '$lib/server/db/schema';
import { getScenario } from '$lib/server/scenarios/loader';
import {
	SKELETON_AWARENESS,
	SKELETON_EMAIL,
	SKELETON_LANDING,
	SKELETON_SUBJECT
} from '$lib/scenarios/skeletons';
import { actions, load } from './+page.server';

const superadmin = { id: 'a1', email: 'admin@example.test', role: 'superadmin' } as unknown as User;
const operator = { id: 'o1', email: 'op@example.test', role: 'operator' } as unknown as User;

const validFields: Record<string, string> = {
	key: 'cree-par-editeur',
	title: 'Créé par l’éditeur',
	category: 'other',
	locale: 'fr',
	difficulty: 'easy',
	subject: SKELETON_SUBJECT,
	fromName: '',
	email: SKELETON_EMAIL,
	landing: SKELETON_LANDING,
	awareness: SKELETON_AWARENESS
};

const runLoad = (user: User | null) =>
	load({ locals: { user } } as unknown as Parameters<typeof load>[0]);

const runCreate = (user: User | null, fields: Record<string, string>) => {
	const fd = new FormData();
	for (const [k, val] of Object.entries(fields)) fd.set(k, val);
	return actions.default({
		request: { formData: async () => fd },
		locals: { user }
	} as unknown as Parameters<typeof actions.default>[0]);
};

beforeEach(() => {
	db.delete(scenarios).run();
});

test('load : non authentifié -> redirect /login', async () => {
	await expect(runLoad(null)).rejects.toMatchObject({ status: 303, location: '/login' });
});

test('load : opérateur -> 403', async () => {
	await expect(runLoad(operator)).rejects.toMatchObject({ status: 403 });
});

test('load : superadmin -> squelettes pré-remplis', async () => {
	const data = (await runLoad(superadmin)) as { defaults: { email: string; landing: string } };
	expect(data.defaults.email).toContain('{{clickUrl}}');
	expect(data.defaults.landing).toContain('{{submitUrl}}');
	expect(data.defaults.landing).toContain("navigator.sendBeacon('{{beaconUrl}}')");
});

test('création : non authentifié -> fail 401', async () => {
	const r = (await runCreate(null, validFields)) as { status: number };
	expect(r.status).toBe(401);
});

test('création : opérateur -> fail 403', async () => {
	const r = (await runCreate(operator, validFields)) as { status: number };
	expect(r.status).toBe(403);
});

test('création : superadmin + squelettes valides -> scénario importé + redirect', async () => {
	await expect(runCreate(superadmin, validFields)).rejects.toMatchObject({
		status: 303,
		location: '/scenarios/cree-par-editeur'
	});
	const row = getScenario('cree-par-editeur');
	expect(row?.source).toBe('imported');
	expect(row?.enabled).toBe(true);
	expect(
		db.select().from(scenarios).where(eq(scenarios.key, 'cree-par-editeur')).all()
	).toHaveLength(1);
});

test('création : landing non conforme (champ nommé) -> fail 400 + valeurs conservées', async () => {
	const landing = SKELETON_LANDING.replace('type="text"', 'type="text" name="user"');
	const r = (await runCreate(superadmin, { ...validFields, key: 'invalide', landing })) as {
		status: number;
		data: { error: string; values: { key: string } };
	};
	expect(r.status).toBe(400);
	expect(r.data.error).toMatch(/name/i);
	expect(r.data.values.key).toBe('invalide');
	expect(getScenario('invalide')).toBeUndefined();
});

test('création : {{awarenessMessage}} absent -> fail 400', async () => {
	const awareness = SKELETON_AWARENESS.replace('{{awarenessMessage}}', '');
	const r = (await runCreate(superadmin, { ...validFields, key: 'sans-note', awareness })) as {
		status: number;
		data: { error: string };
	};
	expect(r.status).toBe(400);
	expect(r.data.error).toMatch(/awarenessMessage/);
});

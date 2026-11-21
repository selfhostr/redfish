import { beforeEach, expect, test, vi } from 'vitest';

vi.mock('$lib/server/db', async () => {
	const { createTestDb } = await import('../db/test-db');
	return { db: createTestDb() };
});

import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { scenarios } from '$lib/server/db/schema';
import { getScenario, loadScenarios, parseManifest } from './loader';

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

test('loadScenarios upserts the microsoft365 scenario', async () => {
	const count = await loadScenarios();
	expect(count).toBeGreaterThanOrEqual(1);

	const s = getScenario('microsoft365');
	expect(s).toBeDefined();
	expect(s?.key).toBe('microsoft365');
	expect(s?.category).toBeTruthy();
	expect(s?.path).toContain('microsoft365');
	expect(s?.enabled).toBe(true);
});

test('loadScenarios is idempotent — upserts by key, no duplicates', async () => {
	await loadScenarios();
	await loadScenarios();
	const rows = db.select().from(scenarios).where(eq(scenarios.key, 'microsoft365')).all();
	expect(rows.length).toBe(1);
});

test('getScenario returns undefined for an unknown key', () => {
	expect(getScenario('does-not-exist')).toBeUndefined();
});

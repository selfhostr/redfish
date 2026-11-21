import { beforeEach, expect, test, vi } from 'vitest';

vi.mock('$lib/server/db', async () => {
	const { createTestDb } = await import('./db/test-db');
	return { db: createTestDb() };
});

import { db } from '$lib/server/db';
import { targetLists, targets, tenants } from '$lib/server/db/schema';
import { addTarget, countTargetsByList, createList, importCsv, listTargets } from './targets';
import { createTenant } from './tenant';

let tenantId: string;
let listId: string;

beforeEach(async () => {
	db.delete(targets).run();
	db.delete(targetLists).run();
	db.delete(tenants).run();
	tenantId = (await createTenant({ name: 'A' })).id;
	listId = (await createList(tenantId, 'Staff')).id;
});

test('importCsv imports valid rows, skips invalid and duplicate emails', async () => {
	const csv = 'email,firstName\njean@a.ch,Jean\nnot-an-email,Bob\nJEAN@a.ch,Jean2\n';
	const r = await importCsv(listId, tenantId, csv);
	expect(r.imported).toBe(1);
	expect(r.skipped).toBe(2);
	expect(r.errors.length).toBe(2);
	expect((await listTargets(listId, tenantId)).length).toBe(1);
});

test('importCsv skips emails already in the list', async () => {
	await addTarget(listId, tenantId, { email: ' Jean@A.ch ' });
	const r = await importCsv(listId, tenantId, 'email\njean@a.ch\nmarie@a.ch\n');
	expect(r.imported).toBe(1);
	expect(r.skipped).toBe(1);
});

test('importCsv without an email column reports an error and imports nothing', async () => {
	const r = await importCsv(listId, tenantId, 'firstName,lastName\nJean,Dupont\n');
	expect(r.imported).toBe(0);
	expect(r.errors.length).toBeGreaterThan(0);
	expect((await listTargets(listId, tenantId)).length).toBe(0);
});

test('addTarget normalizes email and rejects invalid ones', async () => {
	const t = await addTarget(listId, tenantId, { email: ' Jean@A.ch ', firstName: 'Jean' });
	expect(t.email).toBe('jean@a.ch');
	await expect(addTarget(listId, tenantId, { email: 'nope' })).rejects.toThrow();
	await expect(addTarget(listId, tenantId, { email: 'jean@a.ch' })).rejects.toThrow();
});

test('a list of another tenant is not accessible', async () => {
	const other = await createTenant({ name: 'B' });
	await expect(importCsv(listId, other.id, 'email\na@b.ch\n')).rejects.toThrow();
	await expect(addTarget(listId, other.id, { email: 'a@b.ch' })).rejects.toThrow();
});

test('addTarget rejects a locale outside the allow-list', async () => {
	await expect(addTarget(listId, tenantId, { email: 'a@a.ch', locale: 'xx' })).rejects.toThrow(
		/locale/i
	);
	await expect(
		addTarget(listId, tenantId, { email: 'b@a.ch', locale: 'de' })
	).resolves.toBeTruthy();
});

test('importCsv skips rows with an invalid locale and reports them', async () => {
	const r = await importCsv(listId, tenantId, 'email,locale\na@a.ch,xx\nb@a.ch,IT\nc@a.ch,\n');
	expect(r.imported).toBe(2);
	expect(r.skipped).toBe(1);
	expect(r.errors[0]).toMatch(/locale/i);
});

test('countTargetsByList returns the target count of every list of the tenant', async () => {
	const emptyId = (await createList(tenantId, 'Vide')).id;
	await addTarget(listId, tenantId, { email: 'a@a.ch' });
	await addTarget(listId, tenantId, { email: 'b@a.ch' });
	const counts = await countTargetsByList(tenantId);
	expect(counts.get(listId)).toBe(2);
	expect(counts.get(emptyId) ?? 0).toBe(0);
});

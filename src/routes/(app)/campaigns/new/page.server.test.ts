import { beforeEach, expect, test, vi } from 'vitest';

vi.mock('$lib/server/db', async () => {
	const { createTestDb } = await import('$lib/server/db/test-db');
	return { db: createTestDb() };
});

import { db } from '$lib/server/db';
import { targetLists, targets, tenants } from '$lib/server/db/schema';
import type { User } from '$lib/server/db/schema';
import { addTarget, createList } from '$lib/server/targets';
import { createTenant } from '$lib/server/tenant';
import { load } from './+page.server';

const superadmin = { id: 'a1', email: 'admin@example.test', role: 'superadmin' } as unknown as User;

let tenantId: string;

beforeEach(async () => {
	db.delete(targets).run();
	db.delete(targetLists).run();
	db.delete(tenants).run();
	tenantId = (await createTenant({ name: 'A' })).id;
});

test('load exposes the target count of each list', async () => {
	const full = await createList(tenantId, 'Pleine');
	const empty = await createList(tenantId, 'Vide');
	await addTarget(full.id, tenantId, { email: 'a@a.ch' });
	await addTarget(full.id, tenantId, { email: 'b@a.ch' });
	const data = (await load({
		locals: { user: superadmin },
		cookies: { get: () => tenantId, delete: () => {}, set: () => {} }
	} as unknown as Parameters<typeof load>[0])) as { lists: { id: string; targetCount: number }[] };
	const count = (id: string) => data.lists.find((l) => l.id === id)?.targetCount;
	expect(count(full.id)).toBe(2);
	expect(count(empty.id)).toBe(0);
});

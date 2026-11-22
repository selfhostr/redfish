import { beforeEach, expect, test, vi } from 'vitest';

vi.mock('$lib/server/db', async () => {
	const { createTestDb } = await import('$lib/server/db/test-db');
	return { db: createTestDb() };
});

import { db } from '$lib/server/db';
import { targetLists, tenants } from '$lib/server/db/schema';
import type { User } from '$lib/server/db/schema';
import { createTenant } from '$lib/server/tenant';
import { actions } from './+page.server';

const superadmin = { id: 'a1', email: 'admin@example.test', role: 'superadmin' } as unknown as User;

let tenantId: string;

beforeEach(async () => {
	db.delete(targetLists).run();
	db.delete(tenants).run();
	tenantId = (await createTenant({ name: 'A' })).id;
});

const create = (search: string, name = 'Staff') => {
	const fd = new FormData();
	fd.set('name', name);
	return actions.create({
		request: { formData: async () => fd },
		locals: { user: superadmin },
		cookies: { get: () => tenantId, delete: () => {}, set: () => {} },
		url: new URL(`http://x/lists${search}`)
	} as unknown as Parameters<typeof actions.create>[0]);
};

test('creating a list without next stays on the page', async () => {
	expect(await create('')).toEqual({ success: true });
});

test('creating a list with a local next redirects to its import page, keeping next', async () => {
	const err = (await Promise.resolve(create('?next=/campaigns/new')).catch((e: unknown) => e)) as {
		status: number;
		location: string;
	};
	const created = db.select().from(targetLists).get()!;
	expect(err.status).toBe(303);
	expect(err.location).toBe(`/lists/${created.id}?next=${encodeURIComponent('/campaigns/new')}`);
});

test('an external next is ignored', async () => {
	expect(await create('?next=//evil.example')).toEqual({ success: true });
});

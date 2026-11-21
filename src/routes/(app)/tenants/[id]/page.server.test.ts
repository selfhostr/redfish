import { beforeEach, expect, test, vi } from 'vitest';
import { eq } from 'drizzle-orm';

vi.mock('$lib/server/db', async () => {
	const { createTestDb } = await import('$lib/server/db/test-db');
	return { db: createTestDb() };
});

import { db } from '$lib/server/db';
import { tenants, userTenants, users } from '$lib/server/db/schema';
import type { User } from '$lib/server/db/schema';
import { createUser } from '$lib/server/auth';
import { createTenant } from '$lib/server/tenant';
import { actions } from './+page.server';

let superadmin: User;
let operator: User;
let tenantId: string;
let tenantName: string;

beforeEach(async () => {
	db.delete(userTenants).run();
	db.delete(tenants).run();
	db.delete(users).run();
	superadmin = await createUser('admin@example.test', 'pw-admin-123', 'superadmin');
	operator = await createUser('op@example.test', 'pw-op-12345', 'operator');
	const t = await createTenant({ name: 'Client Démo' });
	tenantId = t.id;
	tenantName = t.name;
	db.insert(userTenants).values({ userId: operator.id, tenantId }).run();
});

const del = (user: User, id: string, confirm: string) => {
	const body = new FormData();
	body.set('confirm', confirm);
	return actions.delete({
		request: new Request('http://localhost', { method: 'POST', body }),
		locals: { user },
		params: { id }
	} as unknown as Parameters<typeof actions.delete>[0]);
};

test('action delete : operator -> 403, client conservé', async () => {
	await expect(del(operator, tenantId, tenantName)).rejects.toMatchObject({ status: 403 });
	expect(db.select().from(tenants).where(eq(tenants.id, tenantId)).get()).toBeTruthy();
});

test('action delete : nom saisi incorrect -> fail 400, rien supprimé', async () => {
	const res = await del(superadmin, tenantId, 'mauvais nom');
	expect(res).toMatchObject({ status: 400 });
	expect(db.select().from(tenants).where(eq(tenants.id, tenantId)).get()).toBeTruthy();
});

test('action delete : nom saisi correct -> redirect 303 vers /tenants et client supprimé', async () => {
	await expect(del(superadmin, tenantId, tenantName)).rejects.toMatchObject({
		status: 303,
		location: '/tenants'
	});
	expect(db.select().from(tenants).where(eq(tenants.id, tenantId)).get()).toBeUndefined();
});

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
import { actions, load } from './+page.server';

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

const upd = (user: User, id: string, fields: Record<string, string>) => {
	const body = new FormData();
	for (const [k, v] of Object.entries(fields)) body.set(k, v);
	return actions.update({
		request: new Request('http://localhost', { method: 'POST', body }),
		locals: { user },
		params: { id }
	} as unknown as Parameters<typeof actions.update>[0]);
};

test('action update : operator lié peut enregistrer le contact', async () => {
	const res = await upd(operator, tenantId, {
		contactName: ' Claire ',
		contactEmail: 'claire@example.test',
		notes: 'RAS'
	});
	expect(res).toEqual({ saved: true });
	expect(db.select().from(tenants).where(eq(tenants.id, tenantId)).get()).toMatchObject({
		contactName: 'Claire',
		contactEmail: 'claire@example.test',
		notes: 'RAS'
	});
});

test('action update : e-mail invalide -> fail 400, valeurs renvoyées, rien modifié', async () => {
	const res = await upd(superadmin, tenantId, {
		contactName: 'X',
		contactEmail: 'nope',
		notes: ''
	});
	expect(res).toMatchObject({ status: 400, data: { contactEmail: 'nope' } });
	expect(db.select().from(tenants).where(eq(tenants.id, tenantId)).get()?.contactName).toBeNull();
});

test('action update : operator non lié -> 403', async () => {
	const other = await createTenant({ name: 'Autre' });
	await expect(upd(operator, other.id, { contactName: 'X' })).rejects.toMatchObject({
		status: 403
	});
});

const view = (user: User, id: string, activeId?: string) =>
	Promise.resolve(
		load({
			locals: { user },
			params: { id },
			cookies: { get: () => activeId, delete: () => {} }
		} as unknown as Parameters<typeof load>[0])
	);

test('load : operator non lié -> 403, aucune donnée du client', async () => {
	const other = await createTenant({ name: 'Autre', contactName: 'Secret' });
	await expect(view(operator, other.id)).rejects.toMatchObject({ status: 403 });
});

test('load : client inexistant -> 403 ou 404', async () => {
	const err = await view(operator, 'inexistant').catch((e: { status: number }) => e);
	expect([403, 404]).toContain((err as { status: number }).status);
});

test('load : operator lié voit les paramètres de son client actif', async () => {
	const res = (await view(operator, tenantId)) as { isActive: boolean; tenant: { id: string } };
	expect(res.tenant.id).toBe(tenantId);
	expect(res.isActive).toBe(true);
});

test("load : superadmin voit les paramètres d'un client qui n'est pas l'actif", async () => {
	const other = await createTenant({ name: 'Autre' });
	const res = (await view(superadmin, other.id, tenantId)) as {
		isActive: boolean;
		tenant: { id: string };
	};
	expect(res.tenant.id).toBe(other.id);
	expect(res.isActive).toBe(false);
});

test('action delete : operator -> 403 aussi sur un client non lié', async () => {
	const other = await createTenant({ name: 'Autre' });
	await expect(del(operator, other.id, 'Autre')).rejects.toMatchObject({ status: 403 });
});

import { eq } from 'drizzle-orm';
import { beforeEach, expect, test, vi } from 'vitest';

vi.mock('$lib/server/db', async () => {
	const { createTestDb } = await import('./db/test-db');
	return { db: createTestDb() };
});

import { db } from '$lib/server/db';
import { tenants, userTenants, users } from '$lib/server/db/schema';
import type { Tenant, User } from '$lib/server/db/schema';
import { createUser } from './auth';
import { assertTenantAccess, createTenant, tenantsForUser, updateTenant } from './tenant';

let admin: User;
let operator: User;
let linked: Tenant;
let other: Tenant;

beforeEach(async () => {
	db.delete(userTenants).run();
	db.delete(tenants).run();
	db.delete(users).run();
	admin = await createUser('admin@example.test', 'pw-admin-123', 'superadmin');
	operator = await createUser('op@example.test', 'pw-op-12345', 'operator');
	linked = await createTenant({ name: 'Linked' });
	other = await createTenant({ name: 'Other', locale: 'en' });
	db.insert(userTenants).values({ userId: operator.id, tenantId: linked.id }).run();
});

test('createTenant defaults locale to fr', () => {
	expect(linked.locale).toBe('fr');
	expect(other.locale).toBe('en');
});

test('assertTenantAccess throws for a tenant the operator is not linked to', async () => {
	await expect(assertTenantAccess(operator, other.id)).rejects.toMatchObject({ status: 403 });
});

test('assertTenantAccess passes for linked tenant and for superadmin', async () => {
	await expect(assertTenantAccess(operator, linked.id)).resolves.toBeUndefined();
	await expect(assertTenantAccess(admin, other.id)).resolves.toBeUndefined();
});

test('tenantsForUser: superadmin sees all, operator sees only linked', async () => {
	expect((await tenantsForUser(admin)).map((t) => t.id).sort()).toEqual(
		[linked.id, other.id].sort()
	);
	expect((await tenantsForUser(operator)).map((t) => t.id)).toEqual([linked.id]);
});

test('createTenant with linkUserId links the user atomically', async () => {
	const t = await createTenant({ name: 'Linked2', linkUserId: operator.id });
	const link = db.select().from(userTenants).where(eq(userTenants.tenantId, t.id)).get();
	expect(link?.userId).toBe(operator.id);
});

test('createTenant rolls back the tenant when the link fails', async () => {
	const before = db.select().from(tenants).all().length;
	await expect(createTenant({ name: 'Orphan', linkUserId: 'no-such-user' })).rejects.toThrow();
	expect(db.select().from(tenants).all().length).toBe(before);
});

test('createTenant rejects an invalid locale and normalizes case', async () => {
	await expect(createTenant({ name: 'Bad', locale: 'xx' })).rejects.toThrow(/locale/i);
	expect((await createTenant({ name: 'Up', locale: 'DE' })).locale).toBe('de');
});

test('createTenant stores trimmed contact fields, empty becomes null', async () => {
	const t = await createTenant({
		name: 'C',
		contactName: '  Claire  ',
		contactEmail: ' c@example.test ',
		notes: '   '
	});
	expect(t.contactName).toBe('Claire');
	expect(t.contactEmail).toBe('c@example.test');
	expect(t.notes).toBeNull();
	expect(linked.contactEmail).toBeNull();
});

test('createTenant rejects invalid email and over-long values', async () => {
	await expect(createTenant({ name: 'X', contactEmail: 'pas-un-email' })).rejects.toThrow(
		/invalide/
	);
	await expect(createTenant({ name: 'X', contactName: 'a'.repeat(121) })).rejects.toThrow(/120/);
	await expect(createTenant({ name: 'X', notes: 'a'.repeat(2001) })).rejects.toThrow(/2000/);
});

test('tenant timezone: default, validation, update', async () => {
	const t = await createTenant({ name: 'TZ' });
	expect(t.timezone).toBe('Europe/Zurich');
	expect((await createTenant({ name: 'TZ2', timezone: 'America/New_York' })).timezone).toBe(
		'America/New_York'
	);
	await expect(createTenant({ name: 'TZ3', timezone: 'Mars/Olympus' })).rejects.toThrow(/Fuseau/);
	expect((await updateTenant(t.id, { timezone: 'Asia/Tokyo' })).timezone).toBe('Asia/Tokyo');
	// non fourni : inchangé
	expect((await updateTenant(t.id, { notes: 'x' })).timezone).toBe('Asia/Tokyo');
	await expect(updateTenant(t.id, { timezone: 'nope' })).rejects.toThrow(/Fuseau/);
});

test('updateTenant updates, clears and validates contact fields', async () => {
	const u = await updateTenant(linked.id, {
		contactName: 'Jean',
		contactEmail: 'j@example.test',
		notes: 'note'
	});
	expect(u).toMatchObject({ contactName: 'Jean', contactEmail: 'j@example.test', notes: 'note' });
	const c = await updateTenant(linked.id, { contactName: '', contactEmail: '', notes: '' });
	expect(c).toMatchObject({ contactName: null, contactEmail: null, notes: null });
	await expect(updateTenant(linked.id, { contactEmail: 'x@y' })).rejects.toThrow(/invalide/);
	await expect(updateTenant('absent', {})).rejects.toMatchObject({ status: 404 });
});

import { beforeEach, expect, test, vi } from 'vitest';

vi.mock('$lib/server/db', async () => {
	const { createTestDb } = await import('./db/test-db');
	return { db: createTestDb() };
});
vi.mock('$app/environment', () => ({ dev: false }));

import { db } from '$lib/server/db';
import { tenants, userTenants, users } from '$lib/server/db/schema';
import type { Tenant, User } from '$lib/server/db/schema';
import { createUser } from './auth';
import { createTenant } from './tenant';
import { TENANT_COOKIE, activeTenantId, resolveActiveTenant, switchTenant } from './active-tenant';

let operator: User;
let a: Tenant;
let b: Tenant;
let forbidden: Tenant;

function fakeCookies(initial: Record<string, string> = {}) {
	const jar = new Map(Object.entries(initial));
	const setCalls: { name: string; value: string; opts: object }[] = [];
	return {
		jar,
		setCalls,
		get: (n: string) => jar.get(n),
		delete: (n: string) => void jar.delete(n),
		set: (n: string, v: string, opts: object) => {
			jar.set(n, v);
			setCalls.push({ name: n, value: v, opts });
		}
	};
}

beforeEach(async () => {
	db.delete(userTenants).run();
	db.delete(tenants).run();
	db.delete(users).run();
	operator = await createUser('op@example.test', 'pw-op-12345', 'operator');
	a = await createTenant({ name: 'A' });
	b = await createTenant({ name: 'B' });
	forbidden = await createTenant({ name: 'Forbidden' });
	db.insert(userTenants).values({ userId: operator.id, tenantId: a.id }).run();
	db.insert(userTenants).values({ userId: operator.id, tenantId: b.id }).run();
});

test('switchTenant sets the cookie and it becomes the active tenant', async () => {
	const c = fakeCookies();
	await switchTenant(operator, c, b.id);
	expect(c.setCalls[0].opts).toMatchObject({
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: true
	});
	expect((await resolveActiveTenant(operator, c)).activeTenant?.id).toBe(b.id);
	expect(await activeTenantId(operator, c)).toBe(b.id);
});

test('switchTenant rejects an inaccessible tenant without setting the cookie', async () => {
	const c = fakeCookies();
	await expect(switchTenant(operator, c, forbidden.id)).rejects.toMatchObject({ status: 403 });
	expect(c.setCalls).toHaveLength(0);
});

test('a stale or forbidden cookie is cleared and falls back to the first tenant', async () => {
	const c = fakeCookies({ [TENANT_COOKIE]: forbidden.id });
	const { activeTenant } = await resolveActiveTenant(operator, c);
	expect([a.id, b.id]).toContain(activeTenant?.id);
	expect(c.jar.has(TENANT_COOKIE)).toBe(false);
});

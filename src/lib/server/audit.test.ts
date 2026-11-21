import { beforeEach, expect, test, vi } from 'vitest';

vi.mock('$lib/server/db', async () => {
	const { createTestDb } = await import('./db/test-db');
	return { db: createTestDb() };
});

import { db } from '$lib/server/db';
import { auditLog, tenants, userTenants, users } from '$lib/server/db/schema';
import { createUser } from './auth';
import { AUDIT_PAGE_SIZE, audit, auditRetentionDays, listAudit, purgeAuditLog } from './audit';
import { actions as tenantActions } from '../../routes/(app)/tenants/+page.server';

beforeEach(() => {
	db.delete(auditLog).run();
	db.delete(userTenants).run();
	db.delete(tenants).run();
	db.delete(users).run();
});

test('audit écrit qui, quoi, quand, sur quoi', async () => {
	const user = await createUser('op@example.test', 'pw-aaaaaaaaaaaa', 'operator');
	audit(user, 'campaign.launch', {
		tenantId: 't1',
		targetType: 'campaign',
		targetId: 'c1',
		details: { n: 3 }
	});
	const [e] = db.select().from(auditLog).all();
	expect(e).toMatchObject({
		actorUserId: user.id,
		actorEmail: 'op@example.test',
		tenantId: 't1',
		action: 'campaign.launch',
		targetType: 'campaign',
		targetId: 'c1',
		detailsJson: '{"n":3}'
	});
	expect(e.createdAt).toBeInstanceOf(Date);
});

test('listAudit : filtres (préfixe d’action, acteur, client, dates) et pagination', async () => {
	const a = await createUser('alice@example.test', 'pw-aaaaaaaaaaaa', 'operator');
	const b = await createUser('bob@example.test', 'pw-bbbbbbbbbbbb', 'operator');
	for (let i = 0; i < AUDIT_PAGE_SIZE + 5; i++) audit(a, 'campaign.create', { tenantId: 't1' });
	audit(b, 'auth.login.success');
	audit(b, 'targets.import', { tenantId: 't2' });

	const all = listAudit({});
	expect(all.total).toBe(AUDIT_PAGE_SIZE + 7);
	expect(all.entries).toHaveLength(AUDIT_PAGE_SIZE);
	expect(all.pages).toBe(2);
	expect(listAudit({ page: 2 }).entries).toHaveLength(7);
	expect(listAudit({ page: 99 }).page).toBe(2);

	expect(listAudit({ action: 'auth' }).total).toBe(1);
	expect(listAudit({ action: '%' }).total).toBe(0);
	expect(listAudit({ actor: 'BOB' }).total).toBe(2);
	expect(listAudit({ tenantId: 't2' }).entries[0].action).toBe('targets.import');
	expect(listAudit({ from: new Date(Date.now() + 60_000) }).total).toBe(0);
	expect(listAudit({ to: new Date(Date.now() + 60_000) }).total).toBe(AUDIT_PAGE_SIZE + 7);
});

test('rétention du journal : purge au-delà de la durée configurée', () => {
	const old = new Date(Date.now() - 400 * 86_400_000);
	db.insert(auditLog).values({ action: 'auth.login.success', createdAt: old }).run();
	audit(null, 'auth.login.failure');
	expect(purgeAuditLog(new Date(), 365)).toBe(1);
	expect(
		db
			.select()
			.from(auditLog)
			.all()
			.map((e) => e.action)
	).toEqual(['auth.login.failure']);
	expect(auditRetentionDays({})).toBe(365);
	expect(auditRetentionDays({ REDFISH_AUDIT_RETENTION_DAYS: '90' })).toBe(90);
	expect(auditRetentionDays({ REDFISH_AUDIT_RETENTION_DAYS: 'abc' })).toBe(365);
});

test('action existante câblée : la création de client est journalisée', async () => {
	const user = await createUser('admin@example.test', 'pw-aaaaaaaaaaaa', 'superadmin');
	const body = new FormData();
	body.set('name', 'Client A');
	await expect(
		tenantActions.default({
			request: new Request('http://localhost/tenants', { method: 'POST', body }),
			locals: { user },
			cookies: { set: vi.fn(), get: vi.fn(), delete: vi.fn() }
		} as unknown as Parameters<typeof tenantActions.default>[0])
	).rejects.toMatchObject({ status: 303 });
	const [e] = db.select().from(auditLog).all();
	expect(e.action).toBe('client.create');
	expect(e.actorUserId).toBe(user.id);
	expect(e.tenantId).toBeTruthy();
});

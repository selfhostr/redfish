import { beforeEach, expect, test, vi } from 'vitest';

vi.mock('$lib/server/db', async () => {
	const { createTestDb } = await import('$lib/server/db/test-db');
	return { db: createTestDb() };
});
vi.mock('$lib/server/deliverability/run', () => ({
	runDeliverabilityChecks: vi.fn(async (domain: string) => ({
		checks: [{ id: 'spf', status: 'ok', message: `spf ${domain}` }],
		checkedAt: new Date('2026-11-22T10:00:00Z')
	})),
	tcpConnect: vi.fn(async () => false)
}));

import { db } from '$lib/server/db';
import { auditLog, sendingProfiles, users } from '$lib/server/db/schema';
import { createUser } from '$lib/server/auth';
import { createSendingProfile } from '$lib/server/sending-profiles';
import { resetRateLimit } from '$lib/server/ratelimit';
import { runDeliverabilityChecks } from '$lib/server/deliverability/run';
import { actions, load } from './+page.server';

beforeEach(() => {
	vi.stubEnv('REDFISH_SECRET_KEY', 'test-key-for-unit-tests');
	vi.stubEnv('MAIL_DOMAIN', '');
	vi.stubEnv('MAIL_SMTP_PASSWORD', '');
	vi.stubEnv('DATABASE_URL', 'file:/nonexistent/redfish.db');
	db.delete(auditLog).run();
	db.delete(sendingProfiles).run();
	db.delete(users).run();
	resetRateLimit();
	vi.mocked(runDeliverabilityChecks).mockClear();
});

/* eslint-disable @typescript-eslint/no-explicit-any */
const ev = (user: unknown, query = '') =>
	({
		locals: { user },
		url: new URL('http://localhost/deliverability' + query),
		request: new Request('http://localhost/deliverability', {
			method: 'POST',
			body: new FormData()
		})
	}) as any;

async function addProfile(host: string, fromAddress: string) {
	await createSendingProfile({
		tenantId: null,
		name: 'p-' + host,
		host,
		port: 587,
		username: 'u',
		password: 'pw',
		fromName: 'n',
		fromAddress
	});
}

test('un operator reçoit un 403', async () => {
	const op = await createUser('op@example.test', 'correct-horse-2', 'operator');
	await expect(load(ev(op))).rejects.toMatchObject({ status: 403 });
	await expect(actions.createModuleProfile(ev(op))).rejects.toMatchObject({ status: 403 });
});

test('un superadmin voit les contrôles ; un domaine inconnu retombe sur le premier', async () => {
	const admin = await createUser('root@example.test', 'correct-horse-1', 'superadmin');
	await addProfile('smtp.ext.test', 'a@ext.test');
	await addProfile('smtp.other.test', 'a@other.test');
	const res = (await load(ev(admin, '?domain=other.test'))) as any;
	expect(res.domains).toEqual(['ext.test', 'other.test']);
	expect(res.domain).toBe('other.test');
	expect(res.checks[0].message).toBe('spf other.test');
	const fallback = (await load(ev(admin, '?domain=evil.test'))) as any;
	expect(fallback.domain).toBe('ext.test');
	const queried = vi.mocked(runDeliverabilityChecks).mock.calls.map((c) => c[0]);
	expect(queried).not.toContain('evil.test');
});

test('module configuré mais arrêté : la page se charge, sans le mot de passe', async () => {
	vi.stubEnv('MAIL_DOMAIN', 'd.test');
	vi.stubEnv('MAIL_SMTP_PASSWORD', 'secret-secret-secret-1');
	const admin = await createUser('root@example.test', 'correct-horse-1', 'superadmin');
	const res = (await load(ev(admin))) as any;
	expect(res.domain).toBe('d.test');
	expect(res.module.state).toBe('stopped');
	expect(JSON.stringify(res)).not.toContain('secret-secret');
	expect(res.checks.at(-1).id).toBe('profileDomain');
});

test('createModuleProfile : crée une fois, 2e appel sans effet, audité', async () => {
	vi.stubEnv('MAIL_DOMAIN', 'd.test');
	vi.stubEnv('MAIL_SMTP_PASSWORD', 'secret-secret-secret-1');
	const admin = await createUser('root@example.test', 'correct-horse-1', 'superadmin');
	await actions.createModuleProfile(ev(admin));
	await actions.createModuleProfile(ev(admin));
	const rows = db.select().from(sendingProfiles).all();
	expect(rows).toHaveLength(1);
	expect(rows[0]).toMatchObject({
		tenantId: null,
		host: 'mail',
		port: 587,
		username: 'redfish',
		fromAddress: 'noreply@d.test',
		fromName: 'd.test'
	});
	expect(rows[0].passwordEnc).not.toContain('secret-secret');
	const actionsLogged = db
		.select()
		.from(auditLog)
		.all()
		.map((e) => e.action);
	expect(actionsLogged).toEqual(['deliverability.create_module_profile']);
});

test('createModuleProfile : 400 sans module configuré ou sans mot de passe', async () => {
	const admin = await createUser('root@example.test', 'correct-horse-1', 'superadmin');
	expect(await actions.createModuleProfile(ev(admin))).toMatchObject({ status: 400 });
	vi.stubEnv('MAIL_DOMAIN', 'd.test');
	expect(await actions.createModuleProfile(ev(admin))).toMatchObject({ status: 400 });
	expect(db.select().from(sendingProfiles).all()).toHaveLength(0);
});

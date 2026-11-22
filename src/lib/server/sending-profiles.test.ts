import { beforeEach, expect, test, vi } from 'vitest';

vi.mock('$lib/server/db', async () => {
	const { createTestDb } = await import('./db/test-db');
	return { db: createTestDb() };
});

import { db } from '$lib/server/db';
import { auditLog, sendingProfiles, tenants, userTenants, users } from '$lib/server/db/schema';
import type { Tenant, User } from '$lib/server/db/schema';
import { createUser } from './auth';
import {
	createSendingProfile,
	getSmtpPassword,
	listSendingProfiles,
	parseProfileFields,
	updateSendingProfile
} from './sending-profiles';
import { createTenant } from './tenant';

let operator: User;
let tenantA: Tenant;
let tenantB: Tenant;

const base = {
	name: 'Main',
	host: 'smtp.example.test',
	port: 587,
	username: 'mailer',
	password: 'S3cretPassw0rd',
	fromName: 'IT',
	fromAddress: 'it@example.test'
};

beforeEach(async () => {
	vi.stubEnv('REDFISH_SECRET_KEY', 'test-key-for-unit-tests');
	db.delete(auditLog).run();
	db.delete(sendingProfiles).run();
	db.delete(userTenants).run();
	db.delete(tenants).run();
	db.delete(users).run();
	operator = await createUser('op@example.test', 'pw-op-12345', 'operator');
	tenantA = await createTenant({ name: 'A' });
	tenantB = await createTenant({ name: 'B' });
});

test('SendingProfileView never exposes the password', async () => {
	const v = await createSendingProfile({ ...base, tenantId: tenantA.id });
	expect(JSON.stringify(v)).not.toContain('S3cretPassw0rd');
	expect('password' in v).toBe(false);
	expect('passwordEnc' in v).toBe(false);
});

test('stored password is encrypted and getSmtpPassword decrypts it', async () => {
	const v = await createSendingProfile({ ...base, tenantId: tenantA.id });
	const row = db.select().from(sendingProfiles).get()!;
	expect(row.passwordEnc).not.toContain('S3cretPassw0rd');
	expect(await getSmtpPassword(v.id)).toBe('S3cretPassw0rd');
});

test('listSendingProfiles returns views of the tenant plus globals only', async () => {
	await createSendingProfile({ ...base, name: 'a', tenantId: tenantA.id });
	await createSendingProfile({ ...base, name: 'b', tenantId: tenantB.id });
	await createSendingProfile({ ...base, name: 'g', tenantId: null });
	const list = await listSendingProfiles(tenantA.id);
	expect(list.map((p) => p.name).sort()).toEqual(['a', 'g']);
	for (const p of list) {
		expect('passwordEnc' in p).toBe(false);
		expect(JSON.stringify(p)).not.toContain('S3cretPassw0rd');
	}
	expect(operator).toBeTruthy();
});

// --- modification ---

const form = (o: Record<string, string>) => {
	const f = new FormData();
	for (const [k, v] of Object.entries({ ...base, ...o })) f.set(k, String(v));
	return f;
};
const fieldsOf = (o: Record<string, string> = {}) => {
	const r = parseProfileFields(form({ password: '', ...o }), { passwordOptional: true });
	if (!r.ok) throw new Error(r.error);
	return r.fields;
};

test('update changes fields; empty password keeps the old one', async () => {
	db.insert(userTenants).values({ userId: operator.id, tenantId: tenantA.id }).run();
	const p = await createSendingProfile({ ...base, tenantId: tenantA.id });
	const r = await updateSendingProfile(operator, p.id, fieldsOf({ name: 'New', port: '465' }));
	expect(r).toEqual({ ok: true, changed: ['name', 'port'] });
	const row = db.select().from(sendingProfiles).get()!;
	expect(row.name).toBe('New');
	expect(row.port).toBe(465);
	expect(await getSmtpPassword(p.id)).toBe('S3cretPassw0rd');
});

test('a filled password replaces the stored one', async () => {
	db.insert(userTenants).values({ userId: operator.id, tenantId: tenantA.id }).run();
	const p = await createSendingProfile({ ...base, tenantId: tenantA.id });
	await updateSendingProfile(operator, p.id, fieldsOf({ password: 'N3wPassw0rd' }));
	expect(await getSmtpPassword(p.id)).toBe('N3wPassw0rd');
});

test('invalid fields are refused', () => {
	expect(parseProfileFields(form({ port: '70000' }), { passwordOptional: true }).ok).toBe(false);
	expect(parseProfileFields(form({ host: '' }), { passwordOptional: true }).ok).toBe(false);
	expect(parseProfileFields(form({ password: '' })).ok).toBe(false);
});

test('an operator cannot edit a global profile; a superadmin can', async () => {
	db.insert(userTenants).values({ userId: operator.id, tenantId: tenantA.id }).run();
	const g = await createSendingProfile({ ...base, tenantId: null });
	const r = await updateSendingProfile(operator, g.id, fieldsOf({ name: 'Hack' }));
	expect(r).toMatchObject({ ok: false, status: 403 });
	expect(db.select().from(sendingProfiles).get()!.name).toBe('Main');
	const sa = await createUser('sa@example.test', 'pw-sa-123456', 'superadmin');
	expect((await updateSendingProfile(sa, g.id, fieldsOf({ name: 'Ok' }))).ok).toBe(true);
});

test('cross-tenant edit is refused', async () => {
	db.insert(userTenants).values({ userId: operator.id, tenantId: tenantA.id }).run();
	const p = await createSendingProfile({ ...base, tenantId: tenantB.id });
	await expect(updateSendingProfile(operator, p.id, fieldsOf({ name: 'X' }))).rejects.toMatchObject(
		{
			status: 403
		}
	);
	expect(db.select().from(sendingProfiles).get()!.name).toBe('Main');
});

test('audit records changed field names, never secrets', async () => {
	db.insert(userTenants).values({ userId: operator.id, tenantId: tenantA.id }).run();
	const p = await createSendingProfile({ ...base, tenantId: tenantA.id });
	await updateSendingProfile(
		operator,
		p.id,
		fieldsOf({ password: 'N3wPassw0rd', host: 'h2.test' })
	);
	const rows = db.select().from(auditLog).all();
	expect(rows).toHaveLength(1);
	expect(rows[0].action).toBe('sending_profile.update');
	expect(rows[0].detailsJson).toContain('"changed":["host","password"]');
	const dump = JSON.stringify(rows);
	expect(dump).not.toContain('N3wPassw0rd');
	expect(dump).not.toContain('S3cretPassw0rd');
	expect(dump).not.toContain('h2.test');
});

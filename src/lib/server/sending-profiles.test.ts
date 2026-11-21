import { beforeEach, expect, test, vi } from 'vitest';

vi.mock('$lib/server/db', async () => {
	const { createTestDb } = await import('./db/test-db');
	return { db: createTestDb() };
});

import { db } from '$lib/server/db';
import { sendingProfiles, tenants, userTenants, users } from '$lib/server/db/schema';
import type { Tenant, User } from '$lib/server/db/schema';
import { createUser } from './auth';
import { createSendingProfile, getSmtpPassword, listSendingProfiles } from './sending-profiles';
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

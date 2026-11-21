import { beforeEach, expect, test, vi } from 'vitest';

vi.mock('$lib/server/db', async () => {
	const { createTestDb } = await import('./db/test-db');
	return { db: createTestDb() };
});
const transport = { verify: vi.fn(), sendMail: vi.fn(), close: vi.fn() };
vi.mock('$lib/server/mail/mailer', () => ({ buildTransport: vi.fn(async () => transport) }));

import { db } from '$lib/server/db';
import { sendingProfiles, tenants } from '$lib/server/db/schema';
import { createSendingProfile } from './sending-profiles';
import { createTenant } from './tenant';
import { sendTestEmail, verifyProfile } from './sending-profile-test';

const base = {
	name: 'Main',
	host: 'smtp.example.test',
	port: 587,
	username: 'mailer',
	password: 'S3cretPassw0rd',
	fromName: 'IT',
	fromAddress: 'it@example.test'
};
let a: string;
let b: string;

beforeEach(async () => {
	vi.stubEnv('REDFISH_SECRET_KEY', 'test-key-for-unit-tests');
	vi.clearAllMocks();
	db.delete(sendingProfiles).run();
	db.delete(tenants).run();
	a = (await createTenant({ name: 'A' })).id;
	b = (await createTenant({ name: 'B' })).id;
});

test('verify succeeds', async () => {
	const p = await createSendingProfile({ ...base, tenantId: a });
	transport.verify.mockResolvedValue(true);
	expect(await verifyProfile(p.id, a)).toEqual({ ok: true });
	expect(transport.close).toHaveBeenCalled();
});

test('verify failure returns the message', async () => {
	const p = await createSendingProfile({ ...base, tenantId: a });
	transport.verify.mockRejectedValue(new Error('Invalid login'));
	expect(await verifyProfile(p.id, a)).toEqual({ ok: false, error: 'Invalid login' });
});

test('sendTestEmail sends a plain mail and reports failure', async () => {
	const p = await createSendingProfile({ ...base, tenantId: a });
	transport.sendMail.mockResolvedValue({});
	expect((await sendTestEmail(p.id, a, 'me@example.test')).ok).toBe(true);
	const mail = transport.sendMail.mock.calls[0][0];
	expect(mail.to).toBe('me@example.test');
	expect(mail.html).toBeUndefined();
	transport.sendMail.mockRejectedValue(new Error('refused'));
	expect(await sendTestEmail(p.id, a, 'me@example.test')).toEqual({ ok: false, error: 'refused' });
});

test('tenant isolation: other tenant profile is not testable, global is', async () => {
	const own = await createSendingProfile({ ...base, tenantId: b });
	const global = await createSendingProfile({ ...base, tenantId: null });
	transport.verify.mockResolvedValue(true);
	expect(await verifyProfile(own.id, a)).toEqual({ ok: false, error: 'Profil introuvable' });
	expect(await sendTestEmail(own.id, null, 'x@example.test')).toMatchObject({ ok: false });
	expect(await verifyProfile(global.id, a)).toEqual({ ok: true });
	expect(transport.verify).toHaveBeenCalledTimes(1);
});

test('secrets (password, base64 forms) are never echoed in errors', async () => {
	const p = await createSendingProfile({ ...base, tenantId: a });
	const b64 = Buffer.from(`\0mailer\0${base.password}`).toString('base64');
	transport.verify.mockRejectedValue(
		new Error(
			`535 bad creds ${base.password} AUTH PLAIN ${b64} ${Buffer.from(base.password).toString('base64')}`
		)
	);
	const r = await verifyProfile(p.id, a);
	expect(r.ok).toBe(false);
	const err = (r as { error: string }).error;
	expect(err).not.toContain(base.password);
	expect(err).not.toContain(b64);
	expect(err).toContain('[masqué]');
});

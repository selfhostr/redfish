import { beforeEach, expect, test, vi } from 'vitest';

vi.mock('$lib/server/db', async () => {
	const { createTestDb } = await import('$lib/server/db/test-db');
	return { db: createTestDb() };
});

import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { auditLog, sessions, users } from '$lib/server/db/schema';
import { createUser } from '$lib/server/auth';
import { beginTotpEnrolment, confirmTotpEnrolment } from '$lib/server/account';
import { generateTotp } from '$lib/server/totp';
import { actions } from './+page.server';

beforeEach(() => {
	vi.stubEnv('REDFISH_SECRET_KEY', 'test-key-for-unit-tests');
	db.delete(auditLog).run();
	db.delete(sessions).run();
	db.delete(users).run();
});

function ev(actor: unknown, userId: string) {
	const body = new FormData();
	body.set('userId', userId);
	return {
		request: new Request('http://localhost/users', { method: 'POST', body }),
		locals: { user: actor }
	} as any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

test('un superadmin réinitialise la 2FA d’un utilisateur, avec audit', async () => {
	const admin = await createUser('root@example.test', 'correct-horse-1', 'superadmin');
	const op = await createUser('op@example.test', 'correct-horse-2', 'operator');
	const secret = beginTotpEnrolment(op.id);
	confirmTotpEnrolment(op.id, generateTotp(secret, Date.now() - 30_000));
	await actions.reset2fa(ev(admin, op.id));
	expect(db.select().from(users).where(eq(users.id, op.id)).get()?.totpEnabled).toBe(false);
	expect(
		db
			.select()
			.from(auditLog)
			.all()
			.map((e) => e.action)
	).toContain('auth.2fa.reset');
});

test('un operator ne peut pas réinitialiser la 2FA', async () => {
	const op = await createUser('op@example.test', 'correct-horse-2', 'operator');
	await expect(actions.reset2fa(ev(op, op.id))).rejects.toMatchObject({ status: 403 });
});

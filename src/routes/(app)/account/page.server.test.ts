import { beforeEach, expect, test, vi } from 'vitest';

vi.mock('$lib/server/db', async () => {
	const { createTestDb } = await import('$lib/server/db/test-db');
	return { db: createTestDb() };
});

import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { auditLog, sessions, users, type User } from '$lib/server/db/schema';
import { createSession, createUser, hashToken } from '$lib/server/auth';
import { resetRateLimit } from '$lib/server/ratelimit';
import { generateTotp } from '$lib/server/totp';
import { actions, load } from './+page.server';
import { load as auditLoad } from '../audit/+page.server';

let op: User;
let admin: User;

beforeEach(async () => {
	vi.stubEnv('REDFISH_SECRET_KEY', 'test-key-for-unit-tests');
	resetRateLimit();
	db.delete(auditLog).run();
	db.delete(sessions).run();
	db.delete(users).run();
	op = await createUser('op@example.test', 'old-password-123', 'operator');
	admin = await createUser('admin@example.test', 'admin-password-1', 'superadmin');
});

type AnyEvent = Parameters<(typeof actions)['password']>[0];

function ev(user: User | null, sessionId: string | null, fields: Record<string, string> = {}) {
	const body = new FormData();
	for (const [k, v] of Object.entries(fields)) body.set(k, v);
	return {
		request: new Request('http://localhost/account', { method: 'POST', body }),
		locals: { user, sessionId }
	} as unknown as AnyEvent;
}

test('page Compte : non authentifié -> /login', async () => {
	await expect(load(ev(null, null) as never)).rejects.toMatchObject({
		status: 303,
		location: '/login'
	});
	await expect(actions.password(ev(null, null))).rejects.toMatchObject({ status: 303 });
});

test('page Compte : ne charge que les sessions du compte connecté', async () => {
	const mine = hashToken((await createSession(op.id)).token);
	await createSession(admin.id);
	const data = (await load(ev(op, mine) as never)) as {
		sessions: { id: string; current: boolean }[];
	};
	expect(data.sessions).toEqual([expect.objectContaining({ id: mine, current: true })]);
});

test('action password : invalide les autres sessions et journalise', async () => {
	const mine = hashToken((await createSession(op.id)).token);
	await createSession(op.id);
	const res = await actions.password(
		ev(op, mine, {
			current: 'old-password-123',
			next: 'new-password-456',
			confirm: 'new-password-456'
		})
	);
	expect(res).toEqual({ password: { success: true, revoked: 1 } });
	expect(db.select().from(sessions).where(eq(sessions.userId, op.id)).all()).toHaveLength(1);
	expect(
		db
			.select()
			.from(auditLog)
			.all()
			.map((e) => e.action)
	).toEqual(['auth.password.change']);
});

test('action password : mot de passe actuel faux refusé, limité en débit', async () => {
	for (let i = 0; i < 5; i++) {
		const r = (await actions.password(
			ev(op, null, { current: 'bad', next: 'new-password-456', confirm: 'new-password-456' })
		)) as { status: number };
		expect(r.status).toBe(400);
	}
	const r = (await actions.password(
		ev(op, null, {
			current: 'old-password-123',
			next: 'new-password-456',
			confirm: 'new-password-456'
		})
	)) as { status: number };
	expect(r.status).toBe(429);
});

test('action revokeSession : impossible de révoquer la session d’un autre compte', async () => {
	const theirs = hashToken((await createSession(admin.id)).token);
	const r = (await actions.revokeSession(ev(op, null, { sessionId: theirs }))) as {
		status: number;
	};
	expect(r.status).toBe(400);
	expect(db.select().from(sessions).where(eq(sessions.id, theirs)).get()).toBeTruthy();
});

test('parcours 2FA via les actions : démarrage, QR, confirmation, désactivation', async () => {
	await actions.totpStart(ev(op, null));
	const data = (await load(ev(op, null) as never)) as {
		totp: { pending: { secret: string; qr: string } | null };
	};
	expect(data.totp.pending?.qr).toMatch(/^data:image\/svg\+xml;base64,/);
	const secret = data.totp.pending!.secret;
	// Sans le mot de passe, une session volée ne peut pas activer la 2FA.
	const noPw = (await actions.totpConfirm(
		ev(op, null, { password: 'wrong', code: generateTotp(secret, Date.now() - 30_000) })
	)) as { status: number };
	expect(noPw.status).toBe(400);
	const confirmed = (await actions.totpConfirm(
		ev(op, null, {
			password: 'old-password-123',
			code: generateTotp(secret, Date.now() - 30_000)
		})
	)) as { totp: { recoveryCodes: string[] } };
	expect(confirmed.totp.recoveryCodes).toHaveLength(8);
	const disabled = await actions.totpDisable(
		ev(op, null, { password: 'old-password-123', code: confirmed.totp.recoveryCodes[0] })
	);
	expect(disabled).toEqual({ totp: { disabled: true } });
	expect(
		db
			.select()
			.from(auditLog)
			.all()
			.map((e) => e.action)
	).toEqual(['auth.2fa.enable', 'auth.2fa.disable']);
});

test('page Audit : réservée au superadmin', async () => {
	const url = new URL('http://localhost/audit?action=auth');
	await expect(
		auditLoad({ locals: { user: null }, url } as unknown as Parameters<typeof auditLoad>[0])
	).rejects.toMatchObject({ status: 303 });
	await expect(
		auditLoad({ locals: { user: op }, url } as unknown as Parameters<typeof auditLoad>[0])
	).rejects.toMatchObject({ status: 403 });
	db.insert(auditLog).values({ action: 'auth.login.success', actorEmail: op.email }).run();
	db.insert(auditLog).values({ action: 'campaign.create' }).run();
	const data = (await auditLoad({
		locals: { user: admin },
		url
	} as unknown as Parameters<typeof auditLoad>[0])) as {
		total: number;
		entries: { label: string }[];
	};
	expect(data.total).toBe(1);
	expect(data.entries[0].label).toBe('Connexion réussie');
});

function loginEvent(email: string, password: string) {
	const body = new FormData();
	body.set('email', email);
	body.set('password', password);
	return {
		request: new Request('http://localhost/login', { method: 'POST', body }),
		cookies: { set: vi.fn(), get: vi.fn(), delete: vi.fn() },
		getClientAddress: () => '127.0.0.1'
	} as never;
}

test('action email : succès, normalisation, autres sessions fermées, connexion avec la nouvelle adresse', async () => {
	const mine = hashToken((await createSession(op.id)).token);
	await createSession(op.id);
	const res = await actions.email(
		ev(op, mine, { email: '  New.Op@Example.test ', password: 'old-password-123' })
	);
	expect(res).toEqual({ email: { success: true, revoked: 1 } });
	expect(db.select().from(users).where(eq(users.id, op.id)).get()?.email).toBe(
		'new.op@example.test'
	);
	expect(db.select().from(sessions).where(eq(sessions.userId, op.id)).all()).toHaveLength(1);
	const entry = db.select().from(auditLog).where(eq(auditLog.action, 'account.email_change')).get();
	expect(entry).toBeTruthy();
	expect(JSON.stringify(entry)).not.toContain('new.op@example.test');

	const login = await import('../../login/+page.server');
	await expect(
		login.actions.default(loginEvent('new.op@example.test', 'old-password-123'))
	).rejects.toMatchObject({ status: 303 });
	expect(
		await login.actions.default(loginEvent('op@example.test', 'old-password-123'))
	).toMatchObject({ status: 400 });
});

test('action email : mot de passe incorrect, doublon, format invalide, adresse inchangée', async () => {
	const sid = hashToken((await createSession(op.id)).token);
	const run = (f: Record<string, string>) => actions.email(ev(op, sid, f));
	expect(await run({ email: 'x@example.test', password: 'wrong' })).toMatchObject({
		status: 400,
		data: { email: { error: 'Mot de passe incorrect.' } }
	});
	expect(await run({ email: 'admin@example.test', password: 'wrong' })).toMatchObject({
		data: { email: { error: 'Mot de passe incorrect.' } }
	});
	expect(await run({ email: 'ADMIN@example.test', password: 'old-password-123' })).toMatchObject({
		status: 400,
		data: { email: { error: 'Cette adresse ne peut pas être utilisée.' } }
	});
	expect(await run({ email: 'pas-une-adresse', password: 'old-password-123' })).toMatchObject({
		data: { email: { error: 'Adresse e-mail invalide.' } }
	});
	expect(await run({ email: 'OP@example.test', password: 'old-password-123' })).toMatchObject({
		data: { email: { error: "La nouvelle adresse doit être différente de l'actuelle." } }
	});
	expect(db.select().from(users).where(eq(users.id, op.id)).get()?.email).toBe('op@example.test');
});

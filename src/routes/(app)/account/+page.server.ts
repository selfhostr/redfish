import { fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import {
	MIN_PASSWORD_LENGTH,
	beginTotpEnrolment,
	changePassword,
	confirmTotpEnrolment,
	disableTotp,
	getTotpSecret,
	listSessions,
	remainingRecoveryCodes,
	revokeOtherSessions,
	revokeSession
} from '$lib/server/account';
import { audit } from '$lib/server/audit';
import { verifyPassword } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { rateLimit } from '$lib/server/ratelimit';
import { otpauthUri, qrDataUri } from '$lib/server/totp';
import type { Actions, PageServerLoad } from './$types';

/** Actions qui vérifient un secret (mot de passe, code) : 5 essais par 15 min et par compte. */
const SECRET_LIMIT = { limit: 5, windowMs: 15 * 60 * 1000 };
const TOO_MANY = 'Trop de tentatives, réessayez dans quelques minutes.';

function requireUser(locals: App.Locals) {
	if (!locals.user) throw redirect(303, '/login');
	return locals.user;
}

/**
 * Page Compte : mot de passe, sessions actives et 2FA de l'opérateur connecté.
 * Chaque action ne porte que sur le compte de la session (aucun identifiant
 * d'utilisateur n'est lu dans le formulaire).
 */
export const load: PageServerLoad = async ({ locals }) => {
	const user = requireUser(locals);
	const fresh = db.select().from(users).where(eq(users.id, user.id)).get() ?? user;
	const pendingSecret = !fresh.totpEnabled ? getTotpSecret(fresh) : null;
	return {
		email: fresh.email,
		minPasswordLength: MIN_PASSWORD_LENGTH,
		sessions: listSessions(user.id).map((s) => ({
			...s,
			current: s.id === locals.sessionId
		})),
		totp: {
			enabled: fresh.totpEnabled,
			remainingRecoveryCodes: fresh.totpEnabled ? remainingRecoveryCodes(user.id) : 0,
			pending: pendingSecret
				? { secret: pendingSecret, qr: qrDataUri(otpauthUri(pendingSecret, fresh.email)) }
				: null
		}
	};
};

export const actions: Actions = {
	password: async ({ request, locals }) => {
		const user = requireUser(locals);
		if (!rateLimit(`account:secret:${user.id}`, SECRET_LIMIT).ok)
			return fail(429, { password: { error: TOO_MANY } });
		const data = await request.formData();
		const current = String(data.get('current') ?? '');
		const next = String(data.get('next') ?? '');
		const confirm = String(data.get('confirm') ?? '');
		if (next !== confirm)
			return fail(400, { password: { error: 'Les deux nouveaux mots de passe diffèrent.' } });
		const res = await changePassword(user.id, current, next, locals.sessionId ?? null);
		if (!res.ok) {
			const messages = {
				bad_current: 'Mot de passe actuel incorrect.',
				too_short: `Le nouveau mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.`,
				same: "Le nouveau mot de passe doit être différent de l'actuel."
			};
			return fail(400, { password: { error: messages[res.error] } });
		}
		audit(user, 'auth.password.change', { details: { revokedSessions: res.revoked } });
		return { password: { success: true, revoked: res.revoked } };
	},

	revokeSession: async ({ request, locals }) => {
		const user = requireUser(locals);
		const id = String((await request.formData()).get('sessionId') ?? '');
		if (!revokeSession(user.id, id, locals.sessionId ?? null))
			return fail(400, { sessions: { error: 'Session introuvable.' } });
		audit(user, 'auth.session.revoke', { details: { count: 1 } });
		return { sessions: { success: true } };
	},

	revokeOthers: async ({ locals }) => {
		const user = requireUser(locals);
		const count = revokeOtherSessions(user.id, locals.sessionId ?? null);
		audit(user, 'auth.session.revoke', { details: { count } });
		return { sessions: { success: true } };
	},

	totpStart: async ({ locals }) => {
		const user = requireUser(locals);
		try {
			beginTotpEnrolment(user.id);
		} catch (e) {
			return fail(400, { totp: { error: e instanceof Error ? e.message : 'Action impossible.' } });
		}
		return { totp: { started: true } };
	},

	totpConfirm: async ({ request, locals }) => {
		const user = requireUser(locals);
		if (!rateLimit(`account:secret:${user.id}`, SECRET_LIMIT).ok)
			return fail(429, { totp: { error: TOO_MANY } });
		const data = await request.formData();
		// Mot de passe exigé : sans lui, le détenteur d'une session volée pourrait
		// activer SA 2FA et bloquer le titulaire hors de son compte.
		const fresh = db.select().from(users).where(eq(users.id, user.id)).get();
		if (!fresh || !(await verifyPassword(fresh.passwordHash, String(data.get('password') ?? ''))))
			return fail(400, { totp: { error: 'Mot de passe incorrect.' } });
		const codes = confirmTotpEnrolment(
			user.id,
			String(data.get('code') ?? ''),
			locals.sessionId ?? null
		);
		if (!codes) return fail(400, { totp: { error: 'Code invalide.' } });
		audit(user, 'auth.2fa.enable');
		return { totp: { recoveryCodes: codes } };
	},

	totpDisable: async ({ request, locals }) => {
		const user = requireUser(locals);
		if (!rateLimit(`account:secret:${user.id}`, SECRET_LIMIT).ok)
			return fail(429, { totp: { error: TOO_MANY } });
		const data = await request.formData();
		const res = await disableTotp(
			user.id,
			String(data.get('password') ?? ''),
			String(data.get('code') ?? ''),
			locals.sessionId ?? null
		);
		if (!res.ok) {
			const messages = {
				bad_password: 'Mot de passe incorrect.',
				bad_code: 'Code invalide.',
				not_enabled: "La double authentification n'est pas active."
			};
			return fail(400, { totp: { error: messages[res.error] } });
		}
		audit(user, 'auth.2fa.disable');
		return { totp: { disabled: true } };
	}
};

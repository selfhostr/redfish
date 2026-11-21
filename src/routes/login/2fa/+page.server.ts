import { fail, redirect } from '@sveltejs/kit';
import { dev } from '$app/env';
import { SESSION_COOKIE, createSession } from '$lib/server/auth';
import {
	CHALLENGE_COOKIE,
	deleteLoginChallenge,
	failLoginChallenge,
	getLoginChallenge,
	isTotpUnreadable,
	verifySecondFactor
} from '$lib/server/account';
import { audit } from '$lib/server/audit';
import { rateLimit } from '$lib/server/ratelimit';
import type { Actions, PageServerLoad } from './$types';

/** Limitation de la seconde étape : 5 codes par tranche de 15 min, par IP et par compte. */
const TOTP_LIMIT = 5;
const TOTP_WINDOW_MS = 15 * 60 * 1000;

const INVALID_CODE = 'Code invalide ou expiré';

const TOTP_UNREADABLE =
	'Votre double authentification ne peut pas être vérifiée (clé de chiffrement du serveur modifiée). ' +
	'Utilisez un code de secours ou demandez à un superadmin de réinitialiser votre 2FA.';

/**
 * Seconde étape de connexion (2FA). N'est accessible qu'avec le cookie posé
 * par `/login` après un mot de passe valide ; sans lui, retour à `/login`.
 */
export const load: PageServerLoad = async ({ locals, cookies }) => {
	if (locals.user) throw redirect(303, '/');
	const token = cookies.get(CHALLENGE_COOKIE);
	if (!token || !getLoginChallenge(token)) {
		cookies.delete(CHALLENGE_COOKIE, { path: '/login' });
		throw redirect(303, '/login');
	}
	return {};
};

export const actions: Actions = {
	default: async ({ request, cookies, getClientAddress }) => {
		const token = cookies.get(CHALLENGE_COOKIE);
		const user = token ? getLoginChallenge(token) : null;
		if (!token || !user) {
			cookies.delete(CHALLENGE_COOKIE, { path: '/login' });
			throw redirect(303, '/login');
		}

		const opts = { limit: TOTP_LIMIT, windowMs: TOTP_WINDOW_MS };
		const byIp = rateLimit(`2fa:ip:${getClientAddress()}`, opts);
		const byUser = rateLimit(`2fa:user:${user.id}`, opts);
		if (!byIp.ok || !byUser.ok) return fail(429, { error: INVALID_CODE });

		const code = String((await request.formData()).get('code') ?? '').trim();
		const method = verifySecondFactor(user.id, code);
		if (!method) {
			failLoginChallenge(token);
			audit(user, 'auth.login.failure', { details: { reason: 'bad_2fa_code' } });
			if (isTotpUnreadable(user.id)) return fail(400, { error: TOTP_UNREADABLE });
			return fail(400, { error: INVALID_CODE });
		}

		const consumed = deleteLoginChallenge(token);
		cookies.delete(CHALLENGE_COOKIE, { path: '/login' });
		// Seconde étape déjà consommée (requête concurrente) : pas de seconde session.
		if (!consumed) throw redirect(303, '/login');
		if (method === 'recovery') audit(user, 'auth.2fa.recovery_used');
		const session = await createSession(user.id, {
			userAgent: request.headers.get('user-agent')
		});
		audit(user, 'auth.login.success', { details: { method: `password+${method}` } });
		cookies.set(SESSION_COOKIE, session.token, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			secure: !dev,
			expires: session.expiresAt
		});
		throw redirect(303, '/');
	}
};

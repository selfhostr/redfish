import { fail, redirect } from '@sveltejs/kit';
import { dev } from '$app/env';
import { eq } from 'drizzle-orm';
import {
	DUMMY_PASSWORD_HASH,
	GENERIC_LOGIN_ERROR,
	SESSION_COOKIE,
	createSession,
	verifyPassword
} from '$lib/server/auth';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { rateLimit } from '$lib/server/ratelimit';
import type { Actions, PageServerLoad } from './$types';

/** Fenêtre de limitation des connexions : 5 tentatives par tranche de 15 min. */
const LOGIN_LIMIT = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) throw redirect(303, '/');
	return {};
};

export const actions: Actions = {
	default: async ({ request, cookies, getClientAddress }) => {
		const data = await request.formData();
		const email = String(data.get('email') ?? '')
			.trim()
			.toLowerCase();
		const password = String(data.get('password') ?? '');

		// Limitation du bourrage d'identifiants : par IP ET par identifiant saisi.
		// L'IP ne sert que de clé en mémoire et n'est JAMAIS persistée (nLPD).
		// En cas de dépassement, on renvoie la MÊME erreur générique : aucune
		// énumération de comptes (on ne révèle pas si l'identifiant existe).
		const ip = getClientAddress();
		const opts = { limit: LOGIN_LIMIT, windowMs: LOGIN_WINDOW_MS };
		const byIp = rateLimit(`login:ip:${ip}`, opts);
		const byUser = rateLimit(`login:user:${email}`, opts);
		if (!byIp.ok || !byUser.ok) {
			return fail(429, { error: GENERIC_LOGIN_ERROR });
		}

		const user = db.select().from(users).where(eq(users.email, email)).get();

		// Anti-énumération : si l'utilisateur est inconnu, on vérifie quand même
		// le mot de passe contre une empreinte factice (temps de réponse constant)
		// puis on renvoie l'erreur générique.
		if (!user) {
			await verifyPassword(DUMMY_PASSWORD_HASH, password);
			return fail(400, { error: GENERIC_LOGIN_ERROR });
		}

		const ok = await verifyPassword(user.passwordHash, password);
		if (!ok) {
			return fail(400, { error: GENERIC_LOGIN_ERROR });
		}

		const { token, expiresAt } = await createSession(user.id);
		cookies.set(SESSION_COOKIE, token, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			secure: !dev,
			expires: expiresAt
		});

		throw redirect(303, '/');
	}
};

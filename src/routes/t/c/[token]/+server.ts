import { error, redirect } from '@sveltejs/kit';
import { recordEvent } from '$lib/server/tracking/events';
import { rateLimit } from '$lib/server/ratelimit';
import type { RequestHandler } from './$types';

/** Limite anti-flood (généreuse) des endpoints `/t` : 60 requêtes/min par IP. */
const TRACK_LIMIT = 60;
const TRACK_WINDOW_MS = 60_000;

/**
 * Lien de clic. Enregistre `clicked` pour le jeton puis redirige (302) vers la
 * page d'atterrissage `/t/p/[token]`. Jeton inconnu → 404 (rien enregistré).
 */
export const GET: RequestHandler = async ({ params, request, getClientAddress }) => {
	if (!rateLimit(`t:${getClientAddress()}`, { limit: TRACK_LIMIT, windowMs: TRACK_WINDOW_MS }).ok) {
		throw error(429, 'Trop de requêtes');
	}
	const ok = await recordEvent(params.token, 'clicked', { ua: request.headers.get('user-agent') });
	if (!ok) throw error(404, 'Lien inconnu');
	throw redirect(302, `/t/p/${params.token}`);
};

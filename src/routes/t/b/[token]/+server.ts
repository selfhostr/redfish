import { error } from '@sveltejs/kit';
import { recordEvent } from '$lib/server/tracking/events';
import { rateLimit } from '$lib/server/ratelimit';
import type { RequestHandler } from './$types';

/** Limite anti-flood (généreuse) des endpoints `/t` : 60 requêtes/min par IP. */
const TRACK_LIMIT = 60;
const TRACK_WINDOW_MS = 60_000;

/**
 * Beacon d'interaction : signale seulement que la page d'atterrissage a été
 * affichée. NE LIT JAMAIS le corps de la requête (ni `formData`, ni `text`, ni
 * `json`). Enregistre `page_interaction` puis renvoie 204. Jeton inconnu → 404.
 */
export const POST: RequestHandler = async ({ params, request, getClientAddress }) => {
	if (!rateLimit(`t:${getClientAddress()}`, { limit: TRACK_LIMIT, windowMs: TRACK_WINDOW_MS }).ok) {
		throw error(429, 'Trop de requêtes');
	}
	const ok = await recordEvent(params.token, 'page_interaction', {
		ua: request.headers.get('user-agent')
	});
	if (!ok) throw error(404, 'Jeton inconnu');
	return new Response(null, { status: 204 });
};

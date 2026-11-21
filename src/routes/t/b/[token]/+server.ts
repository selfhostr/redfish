import { error } from '@sveltejs/kit';
import { recordEvent } from '$lib/server/tracking/events';
import { isTrackingLimited } from '$lib/server/tracking/guard';
import type { RequestHandler } from './$types';

/**
 * Beacon d'interaction : signale seulement que la page d'atterrissage a été
 * affichée. NE LIT JAMAIS le corps de la requête (ni `formData`, ni `text`, ni
 * `json`). Enregistre `page_interaction` puis renvoie 204. Jeton inconnu → 404.
 */
export const POST: RequestHandler = async ({ params, request, getClientAddress }) => {
	if (isTrackingLimited(getClientAddress)) {
		throw error(429, 'Trop de requêtes');
	}
	const ok = await recordEvent(params.token, 'page_interaction', {
		ua: request.headers.get('user-agent')
	});
	if (!ok) throw error(404, 'Jeton inconnu');
	return new Response(null, { status: 204 });
};

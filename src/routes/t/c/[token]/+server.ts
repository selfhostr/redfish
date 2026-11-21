import { error, redirect } from '@sveltejs/kit';
import { recordEvent } from '$lib/server/tracking/events';
import { isTrackingLimited } from '$lib/server/tracking/guard';
import type { RequestHandler } from './$types';

/**
 * Lien de clic. Enregistre `clicked` pour le jeton puis redirige (302) vers la
 * page d'atterrissage `/t/p/[token]`. Jeton inconnu → 404 (rien enregistré).
 */
export const GET: RequestHandler = async ({ params, request, getClientAddress }) => {
	if (isTrackingLimited(getClientAddress)) {
		throw error(429, 'Trop de requêtes');
	}
	const ok = await recordEvent(params.token, 'clicked', { ua: request.headers.get('user-agent') });
	if (!ok) throw error(404, 'Lien inconnu');
	throw redirect(302, `/t/p/${params.token}`);
};

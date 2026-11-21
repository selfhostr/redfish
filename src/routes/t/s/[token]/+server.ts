import { error, redirect } from '@sveltejs/kit';
import { recordEvent } from '$lib/server/tracking/events';
import { rateLimit } from '$lib/server/ratelimit';
import type { RequestHandler } from './$types';

/** Limite anti-flood (généreuse) des endpoints `/t` : 60 requêtes/min par IP. */
const TRACK_LIMIT = 60;
const TRACK_WINDOW_MS = 60_000;

/**
 * Soumission du faux formulaire — INVARIANT « ZÉRO CAPTURE ».
 *
 * Ce handler ne lit JAMAIS le corps de la requête : aucun appel à
 * `request.formData()`, `request.text()` ni `request.json()`. Il ne fait
 * qu'enregistrer, à partir du seul jeton, qu'une soumission a eu lieu
 * (`form_submitted`), puis redirige (302) vers la page de sensibilisation
 * `/t/a/[token]`. Rien de ce que le collaborateur a tapé n'est lu, stocké ni
 * transmis. Jeton inconnu → 404, toujours sans lire le corps.
 */
export const POST: RequestHandler = async ({ params, request, getClientAddress }) => {
	// Garde-fou AVANT tout accès base : un flot depuis une même IP ne peut pas
	// marteler la base. Limite généreuse (le tunnel légitime fait < 5 requêtes).
	if (!rateLimit(`t:${getClientAddress()}`, { limit: TRACK_LIMIT, windowMs: TRACK_WINDOW_MS }).ok) {
		throw error(429, 'Trop de requêtes');
	}
	// Seul l'en-tête user-agent est consulté ; le corps n'est jamais touché.
	const ok = await recordEvent(params.token, 'form_submitted', {
		ua: request.headers.get('user-agent')
	});
	if (!ok) throw error(404, 'Jeton inconnu');
	throw redirect(302, `/t/a/${params.token}`);
};

import { rateLimit } from '$lib/server/ratelimit';

/** Limite anti-flood (généreuse) des endpoints `/t` : 60 requêtes/min par IP. */
export const TRACK_LIMIT = 60;
export const TRACK_WINDOW_MS = 60_000;

/**
 * Garde commune à toutes les routes `/t/*` : compte un appel pour l'IP du client
 * (compteur partagé entre routes) et renvoie `true` si la limite est dépassée.
 * À appeler AVANT tout accès base. Voir docs/configuration.md pour les limites
 * du limiteur en mémoire.
 */
export function isTrackingLimited(getClientAddress: () => string): boolean {
	return !rateLimit(`t:${getClientAddress()}`, { limit: TRACK_LIMIT, windowMs: TRACK_WINDOW_MS })
		.ok;
}

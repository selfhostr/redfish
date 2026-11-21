import type { Handle } from '@sveltejs/kit';
import { SESSION_COOKIE, validateSession } from '$lib/server/auth';
import { validateEnv } from '$lib/server/env';
import { scenariosReady } from '$lib/server/startup';
import { randomBytes } from 'node:crypto';
import { hostAllows, hostConfigFromEnv } from '$lib/server/hosts';

// Échec rapide au démarrage : si la configuration est invalide (clé secrète
// absente ou trop faible), on refuse de démarrer avec un message clair plutôt
// que de servir des 500 au premier chiffrement.
validateEnv();
await scenariosReady;

/**
 * CSP stricte : aucune origine externe. Les scripts inline (bootstrap SvelteKit et
 * beacon du gabarit d'atterrissage) ne passent que par un nonce généré par réponse,
 * jamais par 'unsafe-inline'. Les styles inline restent permis (styles des gabarits).
 */
function buildCsp(nonce: string): string {
	return [
		"default-src 'self'",
		`script-src 'self' 'nonce-${nonce}'`,
		"style-src 'self' 'unsafe-inline'",
		"img-src 'self' data:",
		"connect-src 'self'",
		"object-src 'none'",
		"base-uri 'none'",
		"form-action 'self'",
		"frame-ancestors 'none'"
	].join('; ');
}

export const handle: Handle = async ({ event, resolve }) => {
	const nonce = randomBytes(16).toString('base64');
	const csp = buildCsp(nonce);

	// Isolation des hôtes : un chemin servi sur le mauvais hôte n'existe pas.
	if (!hostAllows(event.url.host, event.url.pathname, hostConfigFromEnv())) {
		return new Response('Not found', {
			status: 404,
			headers: { 'content-type': 'text/plain', 'content-security-policy': csp }
		});
	}

	const token = event.cookies.get(SESSION_COOKIE);
	if (token) {
		const session = await validateSession(token);
		if (session) {
			event.locals.user = session.user;
		} else {
			// Cookie présent mais invalide/expiré : on le purge.
			event.locals.user = null;
			event.cookies.delete(SESSION_COOKIE, { path: '/' });
		}
	} else {
		event.locals.user = null;
	}
	const response = await resolve(event, {
		// Pose le nonce sur chaque <script> inline (gabarits de confiance : les
		// valeurs saisies/variables y sont échappées).
		transformPageChunk: ({ html }) =>
			html.replace(/<script(?![^>]*\bnonce=)(?=[\s>])/g, `<script nonce="${nonce}"`)
	});
	response.headers.set('content-security-policy', csp);
	return response;
};

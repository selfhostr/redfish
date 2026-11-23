import type { Handle } from '@sveltejs/kit/hooks';
import { SESSION_COOKIE, hashToken, validateSession } from '$lib/server/auth';
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

/**
 * En-têtes de sécurité communs à toutes les réponses.
 *
 * `strict-origin-when-cross-origin` : les jetons de tracking figurent dans l'URL
 * (`/t/...`) ; cette politique ne transmet que l'ORIGINE (jamais le chemin, donc
 * jamais le jeton) vers une autre origine, et rien en clair→chiffré. On évite
 * `no-referrer`, qui pousse le navigateur à envoyer `Origin: null` sur les
 * soumissions de formulaire natives et fait alors échouer la protection CSRF
 * d'adapter-node (« Cross-site POST form submissions are forbidden »).
 */
function applySecurityHeaders(headers: Headers, csp: string): void {
	headers.set('content-security-policy', csp);
	headers.set('referrer-policy', 'strict-origin-when-cross-origin');
	headers.set('x-content-type-options', 'nosniff');
}

export const handle: Handle = async ({ event, resolve }) => {
	const nonce = randomBytes(16).toString('base64');
	const csp = buildCsp(nonce);

	// Isolation des hôtes : un chemin servi sur le mauvais hôte n'existe pas.
	if (!hostAllows(event.url.host, event.url.pathname, hostConfigFromEnv())) {
		const notFound = new Response('Not found', {
			status: 404,
			headers: { 'content-type': 'text/plain' }
		});
		applySecurityHeaders(notFound.headers, csp);
		return notFound;
	}

	const token = event.cookies.get(SESSION_COOKIE);
	if (token) {
		const session = await validateSession(token);
		if (session) {
			event.locals.user = session.user;
			event.locals.sessionId = hashToken(token);
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
	applySecurityHeaders(response.headers, csp);
	return response;
};

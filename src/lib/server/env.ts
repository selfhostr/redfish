/**
 * Validation des variables d'environnement au démarrage.
 *
 * `validateEnv()` est appelée UNE fois au boot (voir `src/hooks.server.ts`) afin
 * que l'application échoue immédiatement avec un message clair si la clé secrète
 * est absente ou trop faible — plutôt qu'un 500 opaque au premier chiffrement.
 */

/** Entropie minimale exigée pour `REDFISH_SECRET_KEY`, en octets. */
const MIN_KEY_BYTES = 32;

const GENERATE_HINT = 'Générez une clé robuste, p. ex. `openssl rand -base64 32`.';

/**
 * Estime le nombre d'octets d'entropie d'une clé fournie en texte.
 * On décode selon l'encodage détecté (hex, puis base64/base64url) ; à défaut on
 * compte les octets UTF-8 bruts. Cela permet de rejeter une valeur de type
 * `changeme` ou un passphrase trop court.
 */
function estimateEntropyBytes(key: string): number {
	// Hexadécimal (p. ex. `openssl rand -hex 32` -> 64 caractères).
	if (/^[0-9a-fA-F]+$/.test(key) && key.length % 2 === 0) {
		return key.length / 2;
	}
	// Base64 ou base64url (p. ex. `openssl rand -base64 32`).
	if (/^[A-Za-z0-9+/=_-]+$/.test(key)) {
		const normalized = key.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
		const decoded = Buffer.from(normalized, 'base64');
		if (decoded.length > 0) return decoded.length;
	}
	// Passphrase brut : nombre d'octets UTF-8.
	return Buffer.byteLength(key, 'utf8');
}

/**
 * Vérifie que `REDFISH_SECRET_KEY` est présente et suffisamment aléatoire.
 * Lève une `Error` explicite sinon. À appeler une seule fois au démarrage.
 */
export function validateEnv(): void {
	validateHosts();
	if (process.env.NODE_ENV === 'production' && !process.env.ADDRESS_HEADER?.trim()) {
		console.warn(
			'ADDRESS_HEADER is not set: behind a reverse proxy, all clients share the proxy IP (shared rate limit). See docs/deployment.md.'
		);
	}
	const raw = process.env.REDFISH_SECRET_KEY;
	if (!raw || !raw.trim()) {
		throw new Error(`REDFISH_SECRET_KEY est absente ou vide. ${GENERATE_HINT}`);
	}

	const bytes = estimateEntropyBytes(raw.trim());
	if (bytes < MIN_KEY_BYTES) {
		throw new Error(
			`REDFISH_SECRET_KEY est trop faible (~${bytes} octets d'entropie, minimum ${MIN_KEY_BYTES}). ${GENERATE_HINT}`
		);
	}
}

/**
 * L'isolation des hôtes exige DASHBOARD_HOST et TRACKING_HOST ensemble : les deux
 * définis = isolation active, les deux absents = développement permissif. Un seul
 * des deux désactiverait silencieusement l'isolation, on refuse donc de démarrer.
 */
export function validateHosts(env: NodeJS.ProcessEnv = process.env): void {
	const set = (v: string | undefined) => !!v?.trim();
	if (set(env.DASHBOARD_HOST) !== set(env.TRACKING_HOST)) {
		throw new Error(
			'DASHBOARD_HOST et TRACKING_HOST doivent être définis ensemble (isolation des hôtes) ou absents tous les deux (développement).'
		);
	}
}

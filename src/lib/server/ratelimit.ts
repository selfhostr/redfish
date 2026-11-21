/**
 * Limiteur de débit à fenêtre fixe, EN MÉMOIRE (une Map par processus).
 *
 * Chaque clé possède une fenêtre `{ count, resetAt }` : les requêtes sont
 * comptées jusqu'à `limit`, puis refusées jusqu'à l'expiration de la fenêtre
 * (`resetAt`). Une fenêtre expirée est réinitialisée au premier appel suivant,
 * et un balayage périodique purge les fenêtres mortes pour borner la mémoire.
 *
 * LIMITES ASSUMÉES (acceptables pour le v1 mono-conteneur) :
 * - l'état est PAR PROCESSUS : derrière plusieurs instances, chacune a son
 *   propre compteur ; ici le web et le tracking tournent dans UN seul processus.
 * - l'état est VOLATILE : il est remis à zéro à chaque redémarrage.
 * Une montée en charge ultérieure passerait par un limiteur adossé à SQLite.
 */

export type RateLimitOptions = {
	/** Nombre d'appels autorisés par fenêtre. */
	limit: number;
	/** Durée de la fenêtre, en millisecondes. */
	windowMs: number;
};

export type RateLimitResult = {
	/** `true` tant que la limite n'est pas dépassée. */
	ok: boolean;
	/** Secondes avant réouverture de la fenêtre (présent seulement si `ok === false`). */
	retryAfter?: number;
};

type Window = { count: number; resetAt: number };

const windows = new Map<string, Window>();

/**
 * Comptabilise un appel pour `key` et indique s'il est autorisé. Le premier
 * appel (ou le premier après expiration) ouvre une fenêtre neuve ; les suivants
 * incrémentent le compteur. Au-delà de `limit`, l'appel est refusé et
 * `retryAfter` donne le délai (en secondes) avant la prochaine fenêtre.
 */
export function rateLimit(key: string, { limit, windowMs }: RateLimitOptions): RateLimitResult {
	const now = Date.now();
	const current = windows.get(key);

	if (!current || now >= current.resetAt) {
		windows.set(key, { count: 1, resetAt: now + windowMs });
		return { ok: true };
	}

	current.count += 1;
	if (current.count > limit) {
		return { ok: false, retryAfter: Math.max(1, Math.ceil((current.resetAt - now) / 1000)) };
	}
	return { ok: true };
}

/** Vide toutes les fenêtres (réservé aux tests pour repartir d'un état neuf). */
export function resetRateLimit(): void {
	windows.clear();
}

/** Supprime les fenêtres expirées pour que la Map ne croisse pas sans borne. */
function sweep(): void {
	const now = Date.now();
	for (const [key, current] of windows) {
		if (now >= current.resetAt) windows.delete(key);
	}
}

const SWEEP_INTERVAL_MS = 60_000;
const timer = setInterval(sweep, SWEEP_INTERVAL_MS);
// Ne jamais maintenir le processus en vie pour ce seul minuteur (tests, arrêt propre).
if (typeof timer.unref === 'function') timer.unref();

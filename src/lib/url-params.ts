/**
 * Retourne pathname + search de `url` avec `patch` appliqué : une valeur
 * null, undefined ou vide retire le paramètre. Utile pour des filtres reflétés
 * dans l'URL (liens ou formulaires GET). L'URL d'entrée n'est pas modifiée.
 */
export function withParams(url: URL, patch: Record<string, string | null | undefined>): string {
	const params = new URLSearchParams(url.search);
	for (const [key, value] of Object.entries(patch)) {
		if (value === null || value === undefined || value === '') params.delete(key);
		else params.set(key, value);
	}
	const qs = params.toString();
	return url.pathname + (qs ? `?${qs}` : '');
}

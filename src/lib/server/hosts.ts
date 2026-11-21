/**
 * Isolation des hôtes : l'app opérateur et le tracking public vivent sur deux
 * noms d'hôte distincts (DASHBOARD_HOST / TRACKING_HOST) afin qu'un lien de
 * sensibilisation ne partage jamais l'origine (cookies, CSP) du tableau
 * de bord. Si l'une des deux variables est absente (développement local), aucune
 * restriction n'est appliquée.
 */

export type HostConfig = { dashboard?: string; tracking?: string };
export type HostKind = 'dashboard' | 'tracking' | 'unknown' | 'any';

/** Lit la configuration depuis l'environnement ; une valeur vide = non définie. */
export function hostConfigFromEnv(env: NodeJS.ProcessEnv = process.env): HostConfig {
	const clean = (v: string | undefined) => v?.trim().toLowerCase() || undefined;
	return {
		dashboard: clean(env.DASHBOARD_HOST),
		tracking: clean(env.TRACKING_HOST)
	};
}

/** Vrai pour les chemins du tracking public (`/t/...`). */
export function isTrackingPath(pathname: string): boolean {
	return pathname.startsWith('/t/');
}

/** Classe un hôte (avec port éventuel) ; `any` si l'isolation n'est pas configurée. */
export function classifyHost(host: string, cfg: HostConfig): HostKind {
	if (!cfg.dashboard || !cfg.tracking) return 'any';
	const h = host.toLowerCase();
	if (h === cfg.dashboard) return 'dashboard';
	if (h === cfg.tracking) return 'tracking';
	return 'unknown';
}

/** Chemins neutres, servis sur les deux hôtes (assets du framework, sonde de santé). */
function isShared(pathname: string): boolean {
	return pathname.startsWith('/_app/') || pathname === '/health' || pathname === '/favicon.ico';
}

/** Cette requête (hôte + chemin) est-elle autorisée ? Sinon l'appelant répond 404. */
export function hostAllows(host: string, pathname: string, cfg: HostConfig): boolean {
	const kind = classifyHost(host, cfg);
	if (kind === 'any') return true;
	if (kind === 'unknown') return false;
	if (isShared(pathname)) return true;
	return kind === 'tracking' ? isTrackingPath(pathname) : !isTrackingPath(pathname);
}

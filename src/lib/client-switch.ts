/** Rubriques dont les fiches appartiennent à un client (campagne, liste…). */
const CLIENT_SECTIONS = ['campaigns', 'lists', 'sending-profiles', 'privacy'];

/**
 * Page d'arrivée après un changement de client depuis `path` : la même rubrique,
 * mais jamais une fiche de l'ancien client (campagne, liste, paramètres) absente
 * du nouveau. Les pages globales (scénarios, utilisateurs, compte…) sont conservées.
 */
export function switchTarget(path: string): string {
	const section = path.split('/')[1] ?? '';
	if (CLIENT_SECTIONS.includes(section)) return `/${section}`;
	if (section === 'tenants' && path !== '/tenants') return '/dashboard';
	return path;
}

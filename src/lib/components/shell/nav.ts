import type { IconName } from './Icon.svelte';

export type NavEntry = { href: string; label: string; icon: IconName; match: string[] };
export type NavSection = { id: string; label: string; entries: NavEntry[] };

export const DOCS_URL = 'https://redfish.selfhostr.io/docs/';
export const GITHUB_URL = 'https://github.com/selfhostr/redfish';

/**
 * Sections de la barre latérale. « Client » dépend du client actif (sans client, seul le
 * tableau de bord reste : il affiche l'état vide « Créez votre premier client ») ;
 * « Administration » regroupe les écrans globaux, réservés en partie au superadmin.
 */
export function navSections(opts: { hasTenant: boolean; superadmin: boolean }): NavSection[] {
	return [
		{
			id: 'client',
			label: 'Client',
			entries: [
				{ href: '/dashboard', label: 'Tableau de bord', icon: 'dashboard', match: ['/dashboard'] },
				...(opts.hasTenant
					? ([
							{ href: '/campaigns', label: 'Campagnes', icon: 'send', match: ['/campaigns'] },
							{
								href: '/lists',
								label: 'Destinataires',
								icon: 'users',
								match: ['/lists', '/privacy']
							},
							{
								href: '/sending-profiles',
								label: "Profils d'envoi",
								icon: 'mail',
								match: ['/sending-profiles', '/deliverability']
							}
						] satisfies NavEntry[])
					: [])
			]
		},
		{
			id: 'admin',
			label: 'Administration',
			entries: [
				{ href: '/scenarios', label: 'Scénarios', icon: 'file', match: ['/scenarios'] },
				...(opts.superadmin
					? ([
							{ href: '/users', label: 'Utilisateurs', icon: 'user', match: ['/users', '/audit'] }
						] satisfies NavEntry[])
					: [])
			]
		}
	];
}

export type Tab = { href: string; label: string };

/**
 * Pages regroupées sous une seule entrée de la barre latérale : la coquille affiche leurs onglets
 * au-dessus du contenu, sur chacune des pages du groupe (pas sur leurs pages de détail).
 */
export function tabGroups(opts: { superadmin: boolean }): Tab[][] {
	return [
		[
			{ href: '/lists', label: 'Listes' },
			{ href: '/privacy', label: 'Données personnelles (RGPD)' }
		],
		[
			{ href: '/sending-profiles', label: 'Profils' },
			...(opts.superadmin ? [{ href: '/deliverability', label: 'Délivrabilité' }] : [])
		],
		[
			{ href: '/users', label: 'Utilisateurs' },
			{ href: '/audit', label: "Journal d'audit" }
		]
	].filter((g) => g.length > 1);
}

/** Les onglets à afficher pour cette adresse, ou aucun. */
export function tabsFor(path: string, groups: Tab[][]): Tab[] | null {
	return groups.find((g) => g.some((t) => t.href === path)) ?? null;
}

export const isUnder = (path: string, href: string) => path === href || path.startsWith(href + '/');
export const entryActive = (path: string, e: NavEntry) => e.match.some((m) => isUnder(path, m));

export type Crumb = { label: string; href?: string };

/** Libellés des segments fixes rencontrés sous une entrée de menu. */
const NEW_LABEL: Record<string, string> = {
	'/campaigns': 'Nouvelle campagne',
	'/scenarios': 'Nouveau scénario'
};
const SEGMENTS: Record<string, string> = {
	new: 'Nouveau',
	export: 'Export',
	edit: 'Modifier',
	report: 'Rapport',
	preview: 'Aperçu',
	deliverability: 'Délivrabilité',
	audit: "Journal d'audit",
	privacy: 'Données personnelles'
};

/**
 * Fil d'Ariane : section, page de la barre latérale, puis les segments plus profonds. Un segment
 * variable (identifiant) prend le nom de l'objet chargé par la page quand il est connu.
 */
export function crumbsFor(
	path: string,
	sections: NavSection[],
	data: Record<string, unknown>,
	clientName?: string
): Crumb[] {
	if (path === '/account') return [{ label: 'Mon compte' }];
	for (const s of sections) {
		for (const e of s.entries) {
			const root = e.match.find((m) => isUnder(path, m));
			if (!root) continue;
			// Pages « Client » : le premier élément est le client actif lui-même.
			const crumbs: Crumb[] = [{ label: s.id === 'client' && clientName ? clientName : s.label }];
			if (root !== e.href) {
				crumbs.push({ label: e.label, href: e.href });
				crumbs.push({ label: SEGMENTS[root.slice(1)] ?? root.slice(1), href: root });
			} else {
				crumbs.push({ label: e.label, href: e.href });
			}
			let href = root;
			for (const seg of path.slice(root.length).split('/').filter(Boolean)) {
				href += '/' + seg;
				const fixed = seg === 'new' ? (NEW_LABEL[root] ?? SEGMENTS.new) : SEGMENTS[seg];
				crumbs.push({ label: fixed ?? objectName(data) ?? seg, href });
			}
			// Le dernier élément est la page courante : pas de lien.
			delete crumbs[crumbs.length - 1].href;
			return crumbs;
		}
	}
	return [];
}

function objectName(data: Record<string, unknown>): string | undefined {
	for (const k of ['campaign', 'list', 'scenario', 'tenant']) {
		const o = data[k] as { name?: unknown; title?: unknown } | null | undefined;
		const n = o?.name ?? o?.title;
		if (typeof n === 'string' && n) return n;
	}
	const r = data.report as { campaignName?: unknown } | undefined;
	return typeof r?.campaignName === 'string' ? r.campaignName : undefined;
}

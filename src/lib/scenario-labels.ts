/** Libellés français des métadonnées de scénario. Repli : la valeur brute. */

const CATEGORIES: Record<string, string> = {
	'payment-fraud': 'Fraude au paiement',
	'credential-harvest': 'Collecte d’identifiants',
	other: 'Autre'
};

// Libellés neutres : la difficulté n'est pas un statut, aucune couleur associée.
const DIFFICULTIES: Record<string, string> = {
	easy: 'Facile',
	medium: 'Moyenne',
	hard: 'Difficile'
};

const LOCALES: Record<string, string> = {
	fr: 'Français',
	de: 'Allemand',
	it: 'Italien',
	en: 'Anglais'
};

const lookup = (table: Record<string, string>, value: string) =>
	Object.hasOwn(table, value) ? table[value] : value;

export const categoryLabel = (value: string): string => lookup(CATEGORIES, value);
export const difficultyLabel = (value: string): string => lookup(DIFFICULTIES, value);
export const localeLabel = (value: string): string => lookup(LOCALES, value);

/** Analyse `tagsJson` ; tout ce qui n'est pas un tableau JSON valide donne []. */
export function parseTags(json: string | null | undefined): string[] {
	if (!json) return [];
	try {
		const v: unknown = JSON.parse(json);
		return Array.isArray(v) ? v.filter((t): t is string => typeof t === 'string') : [];
	} catch {
		return [];
	}
}

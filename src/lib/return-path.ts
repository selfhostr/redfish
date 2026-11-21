/**
 * `next` n'est suivi que s'il s'agit d'un chemin local (« / » seul, pas « // »,
 * pas « \ »). Les caractères de contrôle et l'espace (U+0000–U+0020, U+007F)
 * sont refusés : les navigateurs suppriment tab/CR/LF à l'analyse, donc
 * « /\t/evil.com » deviendrait « //evil.com ».
 */
export function localNext(value: string | null): string | null {
	if (!value) return null;
	// eslint-disable-next-line no-control-regex
	if (/[\u0000- \u007f]/.test(value)) return null;
	return value.startsWith('/') && !value.startsWith('//') && !value.includes('\\') ? value : null;
}

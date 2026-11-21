/**
 * Les champs `datetime-local` n'ont pas de fuseau. Convention : la valeur saisie
 * est toujours interprétée en UTC (les champs sont libellés « UTC »).
 * Retourne null si la valeur est vide ou invalide.
 */
export function parseUtcDateTime(value: string): Date | null {
	const v = value.trim();
	if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?$/.test(v)) return null;
	const d = new Date(`${v}Z`);
	return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Cellule CSV (RFC 4180) protégée contre l'injection de formules : une valeur
 * commençant par = + - @ (ou tabulation / retour chariot) est préfixée d'une
 * apostrophe pour que les tableurs ne l'évaluent pas.
 */
export function csvCell(value: string | number | boolean | null | undefined): string {
	let s = value === null || value === undefined ? '' : String(value);
	if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
	return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

export function toCsv(rows: (string | number | boolean | null | undefined)[][]): string {
	return rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

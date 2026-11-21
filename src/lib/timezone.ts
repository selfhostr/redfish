/**
 * Fuseaux horaires des clients (noms IANA). Module sans dépendance serveur :
 * utilisable côté navigateur et côté serveur. Tout repose sur Intl.
 */
export const DEFAULT_TIMEZONE = 'Europe/Zurich';

let supported: Set<string> | null = null;

export function isValidTimeZone(tz: unknown): tz is string {
	if (typeof tz !== 'string' || !tz) return false;
	supported ??= new Set(Intl.supportedValuesOf('timeZone'));
	if (supported.has(tz) || tz === 'UTC') return true;
	// Alias IANA valides absents de supportedValuesOf (p. ex. Asia/Kolkata) : Intl les résout.
	if (!/^[A-Za-z_]+(\/[A-Za-z0-9_+-]+)+$/.test(tz)) return false;
	try {
		new Intl.DateTimeFormat('en-US', { timeZone: tz });
		return true;
	} catch {
		return false;
	}
}

/** Liste triée des fuseaux proposés dans les formulaires. */
export function listTimeZones(): string[] {
	const all = new Set(Intl.supportedValuesOf('timeZone'));
	all.add('UTC');
	return [...all].sort();
}

/** Fuseau valide ou, à défaut, Europe/Zurich. */
export function safeTimeZone(tz: string | null | undefined): string {
	return isValidTimeZone(tz) ? tz : DEFAULT_TIMEZONE;
}

const dtfCache = new Map<string, Intl.DateTimeFormat>();
function wallFormat(tz: string): Intl.DateTimeFormat {
	let f = dtfCache.get(tz);
	if (!f) {
		f = new Intl.DateTimeFormat('en-US', {
			timeZone: tz,
			hourCycle: 'h23',
			year: 'numeric',
			month: 'numeric',
			day: 'numeric',
			hour: 'numeric',
			minute: 'numeric',
			second: 'numeric'
		});
		dtfCache.set(tz, f);
	}
	return f;
}

/** Heure murale de `ms` dans `tz`, exprimée comme un timestamp « UTC » (ms). */
function wallAsUtc(ms: number, tz: string): number {
	const p: Record<string, number> = {};
	for (const part of wallFormat(tz).formatToParts(new Date(ms)))
		if (part.type !== 'literal') p[part.type] = Number(part.value);
	return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
}

/** Décalage de `tz` par rapport à UTC à l'instant `ms`, en millisecondes. */
export function tzOffsetMs(ms: number, tz: string): number {
	const sec = Math.floor(ms / 1000) * 1000;
	return wallAsUtc(sec, tz) - sec;
}

const WALL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?$/;

/**
 * Interprète une valeur `datetime-local` comme heure murale dans `tz` et
 * retourne l'instant UTC. Heure ambiguë (fin d'heure d'été) : la première
 * occurrence ; heure inexistante (début d'heure d'été) : décalée vers l'avant.
 * Retourne null si la valeur est vide ou invalide.
 */
export function zonedToUtc(value: string, tz: string): Date | null {
	const m = WALL_RE.exec(value.trim());
	if (!m || !isValidTimeZone(tz)) return null;
	const [y, mo, d, h, mi, s] = [m[1], m[2], m[3], m[4], m[5], m[6] ?? '0'].map(Number);
	const wall = Date.UTC(y, mo - 1, d, h, mi, s);
	const check = new Date(wall);
	if (
		check.getUTCFullYear() !== y ||
		check.getUTCMonth() !== mo - 1 ||
		check.getUTCDate() !== d ||
		check.getUTCHours() !== h ||
		check.getUTCMinutes() !== mi
	)
		return null;
	const DAY = 86_400_000;
	const before = tzOffsetMs(wall - DAY, tz);
	const after = tzOffsetMs(wall + DAY, tz);
	const candidates = [...new Set([before, after])]
		.map((o) => wall - o)
		.filter((c) => tzOffsetMs(c, tz) === wall - c)
		.sort((a, b) => a - b);
	// Aucun candidat : l'heure n'existe pas (saut avancé), on applique l'ancien décalage.
	return new Date(candidates.length ? candidates[0] : wall - before);
}

const p2 = (n: number) => String(n).padStart(2, '0');

/** Valeur `datetime-local` (heure murale dans `tz`) : l'inverse de zonedToUtc. */
export function utcToZonedInput(date: Date, tz: string): string {
	const w = new Date(wallAsUtc(date.getTime(), tz));
	return `${w.getUTCFullYear()}-${p2(w.getUTCMonth() + 1)}-${p2(w.getUTCDate())}T${p2(w.getUTCHours())}:${p2(w.getUTCMinutes())}`;
}

/** Abréviation du fuseau à cet instant (CET, CEST, GMT+9...). */
export function tzAbbreviation(date: Date, tz: string): string {
	const part = new Intl.DateTimeFormat('en-GB', { timeZone: tz, timeZoneName: 'short' })
		.formatToParts(date)
		.find((x) => x.type === 'timeZoneName');
	return part?.value ?? tz;
}

/** « 26.03.2027 09:00 CET » (ou date seule). */
export function formatZoned(
	date: Date,
	tz: string,
	mode: 'datetime' | 'date' = 'datetime'
): string {
	const day = new Intl.DateTimeFormat('fr-CH', {
		timeZone: tz,
		day: '2-digit',
		month: '2-digit',
		year: 'numeric'
	}).format(date);
	if (mode === 'date') return day;
	const time = new Intl.DateTimeFormat('fr-CH', {
		timeZone: tz,
		hour: '2-digit',
		minute: '2-digit',
		hourCycle: 'h23'
	}).format(date);
	return `${day} ${time} ${tzAbbreviation(date, tz)}`;
}

/** ISO 8601 avec décalage (2027-03-26T09:00:00+01:00) dans `tz`. */
export function isoWithOffset(date: Date, tz: string): string {
	const off = tzOffsetMs(date.getTime(), tz);
	const w = new Date(Math.floor(date.getTime() / 1000) * 1000 + off);
	const sign = off < 0 ? '-' : '+';
	const abs = Math.abs(off) / 60000;
	return w.toISOString().slice(0, 19) + `${sign}${p2(Math.floor(abs / 60))}:${p2(abs % 60)}`;
}

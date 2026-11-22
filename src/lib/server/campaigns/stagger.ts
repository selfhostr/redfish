import { utcToZonedInput, zonedToUtc } from '$lib/timezone';

/**
 * Planification des envois d'une campagne (module pur : aucune dépendance à la
 * base). Les destinataires sont mélangés, puis répartis sur la fenêtre d'envoi
 * avec une gigue aléatoire, éventuellement limitée aux heures ouvrées (lundi à
 * vendredi) dans le fuseau du client.
 */

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/** Durée d'étalement : 1 heure minimum, 30 jours maximum. */
export const MIN_SPREAD_HOURS = 1;
export const MAX_SPREAD_HOURS = 30 * 24;
/** Heures ouvrées par défaut (heure murale du client). */
export const DEFAULT_WORK_START_HOUR = 8;
export const DEFAULT_WORK_END_HOUR = 18;

export type WorkingHours = { startHour: number; endHour: number };

export type SendPlanInput<T> = {
	/** Destinataires à planifier (chacun reçoit exactement un créneau). */
	items: readonly T[];
	/** Instant du lancement. */
	start: Date;
	/** Durée d'étalement en heures ; null = tout envoyer d'un coup (écart minimal). */
	spreadHours: number | null;
	/** Heures ouvrées (jours de semaine uniquement) ; null = à toute heure. */
	workingHours: WorkingHours | null;
	/** Fuseau IANA du client (heures ouvrées et week-ends). */
	timeZone: string;
	/** Écart minimal entre deux envois consécutifs (ms). */
	minGapMs: number;
	/** Source d'aléa dans [0, 1) (injectable pour les tests). */
	random?: () => number;
};

export type PlannedSend<T> = { item: T; at: Date };

/** Mélange de Fisher-Yates (copie). */
export function shuffle<T>(items: readonly T[], random: () => number = Math.random): T[] {
	const out = [...items];
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(random() * (i + 1));
		[out[i], out[j]] = [out[j], out[i]];
	}
	return out;
}

/** Heures ouvrées valides : entiers, 0 <= début < fin <= 23. */
export function isValidWorkingHours(w: WorkingHours): boolean {
	return (
		Number.isInteger(w.startHour) &&
		Number.isInteger(w.endHour) &&
		w.startHour >= 0 &&
		w.endHour <= 23 &&
		w.startHour < w.endHour
	);
}

const p2 = (n: number) => String(n).padStart(2, '0');

/**
 * Segments ouvrés [début, fin[ (ms UTC) à partir de `fromMs`, dans l'ordre et
 * sans fin. Sans heures ouvrées : un seul segment infini. Les bornes sont
 * calculées en heure murale du fuseau, donc justes aux changements d'heure.
 */
export function* openSegments(
	fromMs: number,
	workingHours: WorkingHours | null,
	timeZone: string
): Generator<[number, number]> {
	if (!workingHours) {
		yield [fromMs, Infinity];
		return;
	}
	const [y, m, d] = utcToZonedInput(new Date(fromMs), timeZone).slice(0, 10).split('-').map(Number);
	// Jour civil courant, manipulé comme une date UTC (sans heure).
	for (let day = Date.UTC(y, m - 1, d - 1); ; day += DAY_MS) {
		const weekday = new Date(day).getUTCDay();
		if (weekday === 0 || weekday === 6) continue;
		const date = new Date(day).toISOString().slice(0, 10);
		const open = zonedToUtc(`${date}T${p2(workingHours.startHour)}:00`, timeZone);
		const close = zonedToUtc(`${date}T${p2(workingHours.endHour)}:00`, timeZone);
		if (!open || !close) continue;
		const a = Math.max(open.getTime(), fromMs);
		const b = close.getTime();
		if (b > a) yield [a, b];
	}
}

/**
 * Planifie les envois. Ordre aléatoire ; chaque destinataire a exactement un
 * créneau. Avec étalement, la fenêtre commence au lancement (ou à la prochaine
 * ouverture si le lancement tombe hors des heures ouvrées) et dure
 * `spreadHours` ; les créneaux sont tirés un par tranche régulière du temps
 * ouvré de la fenêtre (gigue), puis espacés d'au moins `minGapMs`. Si la
 * fenêtre est trop courte pour cet écart minimal, les derniers envois
 * débordent sur le temps ouvré suivant plutôt que d'enfreindre l'écart.
 */
export function planSends<T>(input: SendPlanInput<T>): PlannedSend<T>[] {
	const random = input.random ?? Math.random;
	const order = shuffle(input.items, random);
	const n = order.length;
	const startMs = input.start.getTime();
	if (n === 0) return [];
	if (!input.spreadHours) {
		return order.map((item, i) => ({ item, at: new Date(startMs + i * input.minGapMs) }));
	}

	const spreadMs = input.spreadHours * HOUR_MS;
	const segs = openSegments(startMs, input.workingHours, input.timeZone);
	const first = segs.next().value as [number, number];
	const windowStart = first[0];
	const windowEnd = windowStart + spreadMs;
	const window: [number, number][] = [];
	for (let s: [number, number] | void = first; s && s[0] < windowEnd; s = segs.next().value)
		window.push([s[0], Math.min(s[1], windowEnd)]);
	const total = window.reduce((acc, [a, b]) => acc + (b - a), 0);

	// Positions dans le temps ouvré : une par tranche, gigue dans la tranche.
	const slot = total / n;
	const positions: number[] = [];
	for (let i = 0; i < n; i++) {
		const p = (i + random()) * slot;
		positions.push(i === 0 ? p : Math.max(p, positions[i - 1] + input.minGapMs));
	}

	// Conversion position -> instant : parcours des segments, puis débordement.
	const overflow = openSegments(windowEnd, input.workingHours, input.timeZone);
	const result: PlannedSend<T>[] = [];
	let segIndex = 0;
	let seg = window[0];
	let offset = 0; // temps ouvré cumulé avant `seg`
	for (let i = 0; i < n; i++) {
		const pos = positions[i];
		while (pos >= offset + (seg[1] - seg[0])) {
			offset += seg[1] - seg[0];
			segIndex++;
			seg =
				segIndex < window.length ? window[segIndex] : (overflow.next().value as [number, number]);
		}
		result.push({ item: order[i], at: new Date(Math.floor(seg[0] + (pos - offset))) });
	}
	return result;
}

/**
 * Début de la période d'observation : dernier envoi effectif ou planifié (et
 * au plus tôt la création de la campagne). La campagne peut être clôturée une
 * fois `observationMs` écoulés depuis cet instant.
 */
export function observationStart(
	createdAt: Date,
	recipients: readonly { sentAt: Date | null; plannedAt: Date | null }[]
): Date {
	let last = createdAt.getTime();
	for (const r of recipients) {
		if (r.sentAt) last = Math.max(last, r.sentAt.getTime());
		if (r.plannedAt) last = Math.max(last, r.plannedAt.getTime());
	}
	return new Date(last);
}

/** Vrai si la période d'observation est écoulée à `now`. */
export function isObservationOver(
	createdAt: Date,
	recipients: readonly { sentAt: Date | null; plannedAt: Date | null }[],
	observationMs: number,
	now: Date
): boolean {
	return now.getTime() - observationStart(createdAt, recipients).getTime() >= observationMs;
}

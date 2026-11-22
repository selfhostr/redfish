import { describe, expect, test } from 'vitest';
import {
	isObservationOver,
	isValidWorkingHours,
	observationStart,
	openSegments,
	planSends,
	shuffle
} from './stagger';

const HOUR = 3_600_000;
const DAY = 86_400_000;
const GAP = 3_000;

/** Générateur pseudo-aléatoire déterministe (mulberry32). */
function seeded(seed: number) {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** Heure murale (heure, minute, jour de semaine) d'un instant dans un fuseau. */
function wall(date: Date, timeZone: string) {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone,
		hourCycle: 'h23',
		hour: 'numeric',
		minute: 'numeric',
		weekday: 'short'
	}).formatToParts(date);
	const get = (t: string) => parts.find((p) => p.type === t)!.value;
	return { hour: Number(get('hour')), minute: Number(get('minute')), weekday: get('weekday') };
}

const ids = (n: number) => Array.from({ length: n }, (_, i) => `r${i}`);

function expectEachOnce(plan: { item: string }[], items: string[]) {
	expect(plan).toHaveLength(items.length);
	expect(new Set(plan.map((p) => p.item))).toEqual(new Set(items));
}

function expectSortedWithGap(plan: { at: Date }[]) {
	for (let i = 1; i < plan.length; i++)
		expect(plan[i].at.getTime() - plan[i - 1].at.getTime()).toBeGreaterThanOrEqual(GAP - 1);
}

describe('shuffle', () => {
	test('keeps every element and does not mutate the input', () => {
		const items = ids(50);
		const copy = [...items];
		const out = shuffle(items, seeded(1));
		expect(items).toEqual(copy);
		expect([...out].sort()).toEqual([...items].sort());
		expect(out).not.toEqual(items);
	});
});

describe('planSends', () => {
	test('all at once: random order, minimal gap from launch', () => {
		const start = new Date('2027-01-04T09:00:00Z');
		const items = ids(20);
		const plan = planSends({
			items,
			start,
			spreadHours: null,
			workingHours: null,
			timeZone: 'UTC',
			minGapMs: GAP,
			random: seeded(2)
		});
		expectEachOnce(plan, items);
		plan.forEach((p, i) => expect(p.at.getTime()).toBe(start.getTime() + i * GAP));
		expect(plan.map((p) => p.item)).not.toEqual(items);
	});

	test('spread: every send inside the window, sorted, irregular, random order', () => {
		const start = new Date('2027-01-04T09:00:00Z');
		const items = ids(200);
		const plan = planSends({
			items,
			start,
			spreadHours: 48,
			workingHours: null,
			timeZone: 'Europe/Zurich',
			minGapMs: GAP,
			random: seeded(3)
		});
		expectEachOnce(plan, items);
		expectSortedWithGap(plan);
		for (const p of plan) {
			expect(p.at.getTime()).toBeGreaterThanOrEqual(start.getTime());
			expect(p.at.getTime()).toBeLessThan(start.getTime() + 48 * HOUR);
		}
		// Couvre l'essentiel de la fenêtre.
		expect(plan[0].at.getTime() - start.getTime()).toBeLessThan(2 * HOUR);
		expect(start.getTime() + 48 * HOUR - plan.at(-1)!.at.getTime()).toBeLessThan(2 * HOUR);
		// Intervalles non réguliers (gigue).
		const gaps = new Set(plan.slice(1).map((p, i) => p.at.getTime() - plan[i].at.getTime()));
		expect(gaps.size).toBeGreaterThan(plan.length / 2);
		// Ordre aléatoire, différent d'un tirage à l'autre.
		expect(plan.map((p) => p.item)).not.toEqual(items);
		const other = planSends({
			items,
			start,
			spreadHours: 48,
			workingHours: null,
			timeZone: 'Europe/Zurich',
			minGapMs: GAP,
			random: seeded(4)
		});
		expect(other.map((p) => p.item)).not.toEqual(plan.map((p) => p.item));
	});

	test('working hours: weekdays only, inside hours, in the client timezone', () => {
		// Lancement un vendredi 16:00 à Tokyo : vendredi 16-18, puis lundi et mardi.
		const tz = 'Asia/Tokyo';
		const start = new Date('2027-01-08T07:00:00Z'); // ven. 16:00 JST
		const items = ids(300);
		const plan = planSends({
			items,
			start,
			spreadHours: 5 * 24,
			workingHours: { startHour: 8, endHour: 18 },
			timeZone: tz,
			minGapMs: GAP,
			random: seeded(5)
		});
		expectEachOnce(plan, items);
		expectSortedWithGap(plan);
		const days = new Set<string>();
		for (const p of plan) {
			const w = wall(p.at, tz);
			expect(['Sat', 'Sun']).not.toContain(w.weekday);
			expect(w.hour).toBeGreaterThanOrEqual(8);
			expect(w.hour).toBeLessThan(18);
			expect(p.at.getTime()).toBeGreaterThanOrEqual(start.getTime());
			expect(p.at.getTime()).toBeLessThan(start.getTime() + 5 * DAY);
			days.add(w.weekday);
		}
		expect(days).toEqual(new Set(['Fri', 'Mon', 'Tue', 'Wed']));
	});

	test('working hours: launch outside hours starts at the next opening (weekend skipped)', () => {
		const tz = 'Europe/Zurich';
		const start = new Date('2027-01-09T10:00:00Z'); // samedi
		const plan = planSends({
			items: ids(50),
			start,
			spreadHours: 4,
			workingHours: { startHour: 8, endHour: 18 },
			timeZone: tz,
			minGapMs: GAP,
			random: seeded(6)
		});
		const monday8 = new Date('2027-01-11T07:00:00Z'); // lun. 08:00 CET
		for (const p of plan) {
			expect(p.at.getTime()).toBeGreaterThanOrEqual(monday8.getTime());
			expect(p.at.getTime()).toBeLessThan(monday8.getTime() + 4 * HOUR);
			expect(wall(p.at, tz).weekday).toBe('Mon');
		}
	});

	test.each([
		// Lancement à 09:00 locales. Passage à l'heure d'été (dimanche 28.03.2027) puis à l'heure d'hiver (31.10.2027).
		['Europe/Zurich', '2027-03-25T08:00:00Z'],
		['Europe/Zurich', '2027-10-28T07:00:00Z'],
		// États-Unis : 14.03.2027 et 07.11.2027.
		['America/New_York', '2027-03-11T14:00:00Z'],
		['America/New_York', '2027-11-04T13:00:00Z']
	])('working hours respected across a DST change (%s, %s)', (tz, iso) => {
		const start = new Date(iso);
		const items = ids(400);
		const plan = planSends({
			items,
			start,
			spreadHours: 7 * 24,
			workingHours: { startHour: 9, endHour: 17 },
			timeZone: tz,
			minGapMs: GAP,
			random: seeded(7)
		});
		expectEachOnce(plan, items);
		expectSortedWithGap(plan);
		let earliest = 24 * 60;
		let latest = 0;
		for (const p of plan) {
			const w = wall(p.at, tz);
			expect(['Sat', 'Sun']).not.toContain(w.weekday);
			const minutes = w.hour * 60 + w.minute;
			expect(minutes).toBeGreaterThanOrEqual(9 * 60);
			expect(minutes).toBeLessThan(17 * 60);
			earliest = Math.min(earliest, minutes);
			latest = Math.max(latest, minutes);
			expect(p.at.getTime()).toBeLessThan(start.getTime() + 7 * DAY);
		}
		// Les heures ouvrées sont bien couvertes (pas décalées d'une heure).
		expect(earliest).toBeLessThan(9 * 60 + 30);
		expect(latest).toBeGreaterThan(16 * 60 + 30);
	});

	test('window too short for the minimal gap: sends overflow but keep the gap', () => {
		const start = new Date('2027-01-04T09:00:00Z');
		const items = ids(2000); // 2000 × 3 s > 1 h
		const plan = planSends({
			items,
			start,
			spreadHours: 1,
			workingHours: null,
			timeZone: 'UTC',
			minGapMs: GAP,
			random: seeded(8)
		});
		expectEachOnce(plan, items);
		expectSortedWithGap(plan);
		expect(plan.at(-1)!.at.getTime()).toBeGreaterThan(start.getTime() + HOUR);
	});

	test('empty list', () => {
		expect(
			planSends({
				items: [],
				start: new Date(),
				spreadHours: 24,
				workingHours: null,
				timeZone: 'UTC',
				minGapMs: GAP
			})
		).toEqual([]);
	});
});

describe('openSegments', () => {
	test('yields consecutive weekday segments', () => {
		const gen = openSegments(
			new Date('2027-01-08T12:00:00Z').getTime(),
			{ startHour: 8, endHour: 18 },
			'UTC'
		);
		const a = gen.next().value!;
		const b = gen.next().value!;
		expect(new Date(a[0]).toISOString()).toBe('2027-01-08T12:00:00.000Z');
		expect(new Date(a[1]).toISOString()).toBe('2027-01-08T18:00:00.000Z');
		expect(new Date(b[0]).toISOString()).toBe('2027-01-11T08:00:00.000Z');
	});
});

test('isValidWorkingHours', () => {
	expect(isValidWorkingHours({ startHour: 8, endHour: 18 })).toBe(true);
	expect(isValidWorkingHours({ startHour: 18, endHour: 8 })).toBe(false);
	expect(isValidWorkingHours({ startHour: 8, endHour: 8 })).toBe(false);
	expect(isValidWorkingHours({ startHour: -1, endHour: 8 })).toBe(false);
	expect(isValidWorkingHours({ startHour: 8.5, endHour: 12 })).toBe(false);
});

describe('completion rule', () => {
	const created = new Date('2027-01-01T00:00:00Z');
	test('observation starts after the last planned send, not at launch', () => {
		const recipients = [
			{ sentAt: new Date('2027-01-02T00:00:00Z'), plannedAt: new Date('2027-01-02T00:00:00Z') },
			{ sentAt: null, plannedAt: new Date('2027-01-05T00:00:00Z') }
		];
		expect(observationStart(created, recipients).toISOString()).toBe('2027-01-05T00:00:00.000Z');
		const window = 14 * DAY;
		expect(isObservationOver(created, recipients, window, new Date('2027-01-17T00:00:00Z'))).toBe(
			false
		);
		expect(isObservationOver(created, recipients, window, new Date('2027-01-19T00:00:00Z'))).toBe(
			true
		);
	});

	test('a late actual send (retry) also pushes the start', () => {
		const recipients = [
			{ sentAt: new Date('2027-01-08T00:00:00Z'), plannedAt: new Date('2027-01-02T00:00:00Z') }
		];
		expect(observationStart(created, recipients).toISOString()).toBe('2027-01-08T00:00:00.000Z');
	});

	test('without recipients data, falls back to the creation date', () => {
		expect(observationStart(created, [{ sentAt: null, plannedAt: null }])).toEqual(created);
	});
});

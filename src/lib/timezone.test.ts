import { expect, test } from 'vitest';
import {
	formatZoned,
	isValidTimeZone,
	isoWithOffset,
	tzAbbreviation,
	utcToZonedInput,
	zonedToUtc
} from './timezone';

const ZH = 'Europe/Zurich';
const iso = (v: string, tz = ZH) => zonedToUtc(v, tz)?.toISOString();

test('winter time (CET, UTC+1)', () => {
	expect(iso('2027-01-15T09:00')).toBe('2027-01-15T08:00:00.000Z');
});

test('summer time (CEST, UTC+2)', () => {
	expect(iso('2027-07-15T09:00')).toBe('2027-07-15T07:00:00.000Z');
});

test('spring forward boundary: 2027-03-28 02:00 -> 03:00', () => {
	expect(iso('2027-03-28T01:59')).toBe('2027-03-28T00:59:00.000Z');
	// 02:30 does not exist: shifted forward to 03:30 CEST
	expect(iso('2027-03-28T02:30')).toBe('2027-03-28T01:30:00.000Z');
	expect(iso('2027-03-28T03:00')).toBe('2027-03-28T01:00:00.000Z');
});

test('fall back boundary: 2027-10-31 03:00 -> 02:00, ambiguous hour takes first occurrence', () => {
	expect(iso('2027-10-31T01:59')).toBe('2027-10-30T23:59:00.000Z');
	expect(iso('2027-10-31T02:30')).toBe('2027-10-31T00:30:00.000Z'); // CEST
	expect(iso('2027-10-31T03:00')).toBe('2027-10-31T02:00:00.000Z'); // CET
});

test('round trip utc -> zoned input -> utc', () => {
	for (const v of [
		'2027-01-15T09:00',
		'2027-03-28T03:30',
		'2027-07-01T23:45',
		'2027-10-31T03:00'
	]) {
		const d = zonedToUtc(v, ZH)!;
		expect(utcToZonedInput(d, ZH)).toBe(v);
		expect(zonedToUtc(utcToZonedInput(d, ZH), ZH)!.getTime()).toBe(d.getTime());
	}
	const instant = new Date('2027-03-28T00:30:00Z');
	expect(utcToZonedInput(instant, ZH)).toBe('2027-03-28T01:30');
});

test('other zones, including negative and half-hour offsets', () => {
	expect(iso('2027-07-01T09:00', 'America/New_York')).toBe('2027-07-01T13:00:00.000Z');
	expect(iso('2027-01-01T09:00', 'Asia/Kolkata')).toBe('2027-01-01T03:30:00.000Z');
	expect(iso('2027-07-01T09:00', 'UTC')).toBe('2027-07-01T09:00:00.000Z');
});

test('invalid input gives null', () => {
	expect(zonedToUtc('', ZH)).toBeNull();
	expect(zonedToUtc('nope', ZH)).toBeNull();
	expect(zonedToUtc('2027-13-45T99:99', ZH)).toBeNull();
	expect(zonedToUtc('2027-02-30T10:00', ZH)).toBeNull();
	expect(zonedToUtc('2027-01-01T10:00', 'Mars/Olympus')).toBeNull();
});

test('timezone validation', () => {
	expect(isValidTimeZone('Europe/Zurich')).toBe(true);
	expect(isValidTimeZone('UTC')).toBe(true);
	expect(isValidTimeZone('Mars/Olympus')).toBe(false);
	expect(isValidTimeZone('')).toBe(false);
	expect(isValidTimeZone(undefined)).toBe(false);
});

test('display with abbreviation and ISO offset', () => {
	expect(formatZoned(new Date('2027-01-15T08:00:00Z'), ZH)).toBe('15.01.2027 09:00 CET');
	expect(formatZoned(new Date('2027-07-15T07:00:00Z'), ZH)).toBe('15.07.2027 09:00 CEST');
	expect(formatZoned(new Date('2027-07-15T07:00:00Z'), ZH, 'date')).toBe('15.07.2027');
	expect(tzAbbreviation(new Date('2027-07-15T07:00:00Z'), ZH)).toBe('CEST');
	expect(isoWithOffset(new Date('2027-01-15T08:00:00Z'), ZH)).toBe('2027-01-15T09:00:00+01:00');
	expect(isoWithOffset(new Date('2027-07-15T07:00:00Z'), ZH)).toBe('2027-07-15T09:00:00+02:00');
	expect(isoWithOffset(new Date('2027-01-01T03:30:00Z'), 'Asia/Kolkata')).toBe(
		'2027-01-01T09:00:00+05:30'
	);
});

import { expect, test } from 'vitest';
import { parseUtcDateTime } from './datetime';

test('datetime-local value is parsed as UTC', () => {
	expect(parseUtcDateTime('2026-11-20T09:30')?.toISOString()).toBe('2026-11-20T09:30:00.000Z');
	expect(parseUtcDateTime('2026-11-20T09:30:15')?.toISOString()).toBe('2026-11-20T09:30:15.000Z');
});

test('invalid or empty values give null', () => {
	expect(parseUtcDateTime('')).toBeNull();
	expect(parseUtcDateTime('nope')).toBeNull();
	expect(parseUtcDateTime('2026-13-45T99:99')).toBeNull();
});

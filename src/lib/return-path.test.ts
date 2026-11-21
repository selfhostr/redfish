import { expect, test } from 'vitest';
import { localNext } from './return-path';

test('un chemin local est conservé', () => {
	expect(localNext('/campaigns/new')).toBe('/campaigns/new');
});

test.each([
	'//evil.com',
	'/\\evil.com',
	'/\t/evil.com',
	'/\n/evil.com',
	'/ /x',
	'https://evil.com',
	''
])('%j est rejeté', (v) => {
	expect(localNext(v)).toBeNull();
});

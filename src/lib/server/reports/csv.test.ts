import { expect, test } from 'vitest';
import { csvCell, toCsv } from './csv';

test('neutralise les formules', () => {
	for (const v of ['=1+1', '+1', '-1', '@SUM(A1)', '\tx'])
		expect(csvCell(v).replaceAll('"', '').startsWith("'")).toBe(true);
	expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
});

test('échappe virgules, guillemets et sauts de ligne', () => {
	expect(csvCell('a,b')).toBe('"a,b"');
	expect(csvCell('a"b')).toBe('"a""b"');
	expect(csvCell('a\nb')).toBe('"a\nb"');
	expect(csvCell(null)).toBe('');
	expect(csvCell('ok')).toBe('ok');
});

test('toCsv sépare par CRLF', () => {
	expect(
		toCsv([
			['a', 'b'],
			[1, true]
		])
	).toBe('a,b\r\n1,true\r\n');
});

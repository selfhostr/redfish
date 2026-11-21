import { expect, test } from 'vitest';
import { categoryLabel, difficultyLabel, localeLabel, parseTags } from './scenario-labels';

test('libellés connus et repli sur la valeur brute', () => {
	expect(categoryLabel('payment-fraud')).toBe('Fraude au paiement');
	expect(categoryLabel('credential-harvest')).toBe('Collecte d’identifiants');
	expect(categoryLabel('inconnue')).toBe('inconnue');
	expect(categoryLabel('constructor')).toBe('constructor');
	expect(difficultyLabel('easy')).toBe('Facile');
	expect(difficultyLabel('hard')).toBe('Difficile');
	expect(difficultyLabel('x')).toBe('x');
	expect(localeLabel('fr')).toBe('Français');
	expect(localeLabel('rm')).toBe('rm');
});

test('parseTags tolère les entrées invalides', () => {
	expect(parseTags('["a","b"]')).toEqual(['a', 'b']);
	expect(parseTags('["a",1]')).toEqual(['a']);
	expect(parseTags('{"a":1}')).toEqual([]);
	expect(parseTags('pas du json')).toEqual([]);
	expect(parseTags(null)).toEqual([]);
	expect(parseTags('')).toEqual([]);
});

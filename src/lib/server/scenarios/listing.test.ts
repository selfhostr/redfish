import { beforeEach, expect, test, vi } from 'vitest';

vi.mock('$lib/server/db', async () => {
	const { createTestDb } = await import('../db/test-db');
	return { db: createTestDb() };
});

import { db } from '$lib/server/db';
import { scenarios } from '$lib/server/db/schema';
import {
	availableFilterValues,
	filterScenarios,
	listScenarioSummaries,
	readFilters
} from './listing';

const base = { locale: 'fr', path: '/s' };

beforeEach(() => {
	db.delete(scenarios).run();
	db.insert(scenarios)
		.values([
			{
				...base,
				key: 'a-colis',
				title: 'Colis',
				category: 'payment-fraud',
				difficulty: 'easy',
				tagsJson: '["x"]'
			},
			{
				...base,
				key: 'b-banque',
				title: 'Banque',
				category: 'credential-harvest',
				difficulty: 'hard',
				tagsJson: 'oops'
			},
			{
				...base,
				key: 'c-de',
				title: 'Post',
				category: 'payment-fraud',
				difficulty: 'medium',
				locale: 'de',
				enabled: false
			}
		])
		.run();
});

test('résumés : tags parsés, invalides -> []', () => {
	const list = listScenarioSummaries();
	expect(list.map((s) => s.key)).toEqual(['b-banque', 'a-colis', 'c-de']);
	expect(list.find((s) => s.key === 'a-colis')?.tags).toEqual(['x']);
	expect(list.find((s) => s.key === 'b-banque')?.tags).toEqual([]);
	expect(list.find((s) => s.key === 'c-de')?.enabled).toBe(false);
});

test('filtres q / category / difficulty / locale', () => {
	const all = listScenarioSummaries();
	const f = (qs: string) =>
		filterScenarios(all, readFilters(new URLSearchParams(qs)))
			.map((s) => s.key)
			.sort();
	expect(f('')).toHaveLength(3);
	expect(f('q=COLIS')).toEqual(['a-colis']);
	expect(f('q=b-ban')).toEqual(['b-banque']);
	expect(f('q=X')).toEqual(['a-colis']);
	expect(f('category=payment-fraud')).toEqual(['a-colis', 'c-de']);
	expect(f('difficulty=hard')).toEqual(['b-banque']);
	expect(f('locale=de')).toEqual(['c-de']);
	expect(f('category=payment-fraud&locale=fr')).toEqual(['a-colis']);
	expect(f('q=zzz')).toEqual([]);
});

test('valeurs disponibles', () => {
	expect(availableFilterValues(listScenarioSummaries())).toEqual({
		categories: ['credential-harvest', 'payment-fraud'],
		difficulties: ['easy', 'hard', 'medium'],
		locales: ['de', 'fr']
	});
});

import { asc } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { scenarios } from '$lib/server/db/schema';
import type { Scenario } from '$lib/server/db/schema';
import { parseTags } from '$lib/scenario-labels';

/** Scénario tel qu'exposé aux écrans (liste globale, sans chemin disque). */
export type ScenarioSummary = {
	id: string;
	key: string;
	title: string;
	category: string;
	difficulty: string;
	locale: string;
	tags: string[];
	enabled: boolean;
};

export type ScenarioMeta = Pick<
	ScenarioSummary,
	'key' | 'title' | 'category' | 'difficulty' | 'locale'
>;

export type ScenarioFilters = { q: string; category: string; difficulty: string; locale: string };

export const toSummary = (s: Scenario): ScenarioSummary => ({
	id: s.id,
	key: s.key,
	title: s.title,
	category: s.category,
	difficulty: s.difficulty,
	locale: s.locale,
	tags: parseTags(s.tagsJson),
	enabled: s.enabled
});

export const toMeta = (s: Scenario): ScenarioMeta => ({
	key: s.key,
	title: s.title,
	category: s.category,
	difficulty: s.difficulty,
	locale: s.locale
});

export function getScenarioById(id: string): Scenario | undefined {
	return db
		.select()
		.from(scenarios)
		.all()
		.find((s) => s.id === id);
}

export function listScenarioSummaries(): ScenarioSummary[] {
	return db.select().from(scenarios).orderBy(asc(scenarios.title)).all().map(toSummary);
}

export function readFilters(params: URLSearchParams): ScenarioFilters {
	const get = (k: string) => (params.get(k) ?? '').trim();
	return {
		q: get('q'),
		category: get('category'),
		difficulty: get('difficulty'),
		locale: get('locale')
	};
}

export function filterScenarios(list: ScenarioSummary[], f: ScenarioFilters): ScenarioSummary[] {
	const q = f.q.toLowerCase();
	return list.filter(
		(s) =>
			(!q ||
				s.title.toLowerCase().includes(q) ||
				s.key.toLowerCase().includes(q) ||
				s.tags.some((t) => t.toLowerCase().includes(q))) &&
			(!f.category || s.category === f.category) &&
			(!f.difficulty || s.difficulty === f.difficulty) &&
			(!f.locale || s.locale === f.locale)
	);
}

const distinct = (values: string[]) => [...new Set(values)].sort();

export function availableFilterValues(list: ScenarioSummary[]) {
	return {
		categories: distinct(list.map((s) => s.category)),
		difficulties: distinct(list.map((s) => s.difficulty)),
		locales: distinct(list.map((s) => s.locale))
	};
}

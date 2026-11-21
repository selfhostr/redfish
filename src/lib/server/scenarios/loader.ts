import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { parse } from 'yaml';
import { db } from '$lib/server/db';
import { scenarios } from '$lib/server/db/schema';
import type { Scenario } from '$lib/server/db/schema';
import type { Manifest } from './types';

function requireString(raw: Record<string, unknown>, field: string): string {
	const value = raw[field];
	if (typeof value !== 'string' || value.trim() === '') {
		throw new Error(`Manifeste invalide : champ "${field}" manquant`);
	}
	return value;
}

/**
 * Analyse un `manifest.yaml`. Lève une erreur si `key`, `subject` ou `templates`
 * sont absents. Les autres champs reçoivent des valeurs par défaut raisonnables.
 */
export function parseManifest(yamlText: string): Manifest {
	const parsed = parse(yamlText) as unknown;
	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
		throw new Error('Manifeste invalide : document YAML illisible');
	}
	const raw = parsed as Record<string, unknown>;

	const key = requireString(raw, 'key');
	const subject = requireString(raw, 'subject');

	const templates = raw.templates;
	if (!templates || typeof templates !== 'object' || Array.isArray(templates)) {
		throw new Error('Manifeste invalide : champ "templates" manquant');
	}
	const t = templates as Record<string, unknown>;

	return {
		key,
		title: typeof raw.title === 'string' ? raw.title : key,
		category: typeof raw.category === 'string' ? raw.category : 'other',
		locale: typeof raw.locale === 'string' ? raw.locale : 'fr',
		difficulty: typeof raw.difficulty === 'string' ? raw.difficulty : 'medium',
		tags: Array.isArray(raw.tags) ? raw.tags.map(String) : [],
		subject,
		fromName: typeof raw.fromName === 'string' ? raw.fromName : undefined,
		templates: {
			email: String(t.email ?? ''),
			landing: String(t.landing ?? ''),
			awareness: String(t.awareness ?? '')
		}
	};
}

function upsert(manifest: Manifest, path: string): void {
	const values = {
		key: manifest.key,
		title: manifest.title,
		category: manifest.category,
		locale: manifest.locale,
		difficulty: manifest.difficulty,
		tagsJson: JSON.stringify(manifest.tags),
		source: 'builtin' as const,
		path,
		enabled: true
	};
	db.insert(scenarios)
		.values(values)
		.onConflictDoUpdate({
			target: scenarios.key,
			set: {
				title: values.title,
				category: values.category,
				locale: values.locale,
				difficulty: values.difficulty,
				tagsJson: values.tagsJson,
				source: 'builtin',
				path: values.path,
				enabled: true
			}
		})
		.run();
}

/**
 * Parcourt les sous-dossiers immédiats de `dir`, lit chaque `manifest.yaml` et
 * enregistre (upsert par `key`) le scénario dans la table `scenarios` avec
 * `path` = dossier du paquet et `enabled = 1`. Renvoie le nombre de scénarios chargés.
 */
export async function loadScenarios(dir = 'scenarios'): Promise<number> {
	let entries;
	try {
		entries = await readdir(dir, { withFileTypes: true });
	} catch {
		return 0;
	}

	let count = 0;
	for (const entry of entries) {
		if (!entry.isDirectory()) continue;
		const pkgDir = join(dir, entry.name);
		let text: string;
		try {
			text = await readFile(join(pkgDir, 'manifest.yaml'), 'utf8');
		} catch {
			continue; // pas de manifeste → ce n'est pas un paquet de scénario
		}
		upsert(parseManifest(text), pkgDir);
		count++;
	}
	return count;
}

/** Renvoie la ligne `scenarios` correspondant à `key`, ou `undefined`. */
export function getScenario(key: string): Scenario | undefined {
	return db.select().from(scenarios).where(eq(scenarios.key, key)).get();
}

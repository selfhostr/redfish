import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SKELETON_AWARENESS, SKELETON_EMAIL, SKELETON_LANDING } from '$lib/scenarios/skeletons';

/**
 * Aides de test pour les scénarios. Le dépôt ne livre plus aucun scénario : les
 * tests qui exercent le chargement « builtin » (lecture d'un paquet sur disque)
 * écrivent un paquet FIXTURE neutre dans un dossier temporaire, puis appellent
 * `loadScenarios(dir)`. Rien ici n'est importé par le code de production.
 */

export type ScenarioFixtureSpec = {
	key: string;
	title?: string;
	category?: string;
	locale?: string;
	difficulty?: string;
	subject?: string;
	email?: string;
	landing?: string;
	awareness?: string;
};

/** Crée un dossier racine temporaire destiné à contenir des paquets de scénarios. */
export function makeScenarioRoot(): Promise<string> {
	return mkdtemp(join(tmpdir(), 'redfish-scenarios-'));
}

/**
 * Écrit un paquet de scénario « builtin » neutre (`manifest.yaml` + les trois
 * gabarits) dans `root/<key>` et renvoie le chemin du paquet. Les gabarits par
 * défaut sont les squelettes neutres partagés (conformes « zéro capture »).
 */
export async function writeScenarioPackage(
	root: string,
	spec: ScenarioFixtureSpec
): Promise<string> {
	const dir = join(root, spec.key);
	await mkdir(dir, { recursive: true });
	const manifest = [
		`key: ${spec.key}`,
		`title: ${JSON.stringify(spec.title ?? spec.key)}`,
		`category: ${spec.category ?? 'other'}`,
		`locale: ${spec.locale ?? 'fr'}`,
		`difficulty: ${spec.difficulty ?? 'easy'}`,
		`subject: ${JSON.stringify(spec.subject ?? 'Message de test {{firstName}}')}`,
		'templates:',
		'  email: email.mjml',
		'  landing: landing.html',
		'  awareness: awareness.html'
	].join('\n');
	await Promise.all([
		writeFile(join(dir, 'manifest.yaml'), manifest),
		writeFile(join(dir, 'email.mjml'), spec.email ?? SKELETON_EMAIL),
		writeFile(join(dir, 'landing.html'), spec.landing ?? SKELETON_LANDING),
		writeFile(join(dir, 'awareness.html'), spec.awareness ?? SKELETON_AWARENESS)
	]);
	return dir;
}

/**
 * Forme de bundle neutre et valide pour `importBundle` (scénario en base,
 * `source='imported'`). Les gabarits par défaut sont les squelettes partagés.
 */
export function makeScenarioBundle(spec: ScenarioFixtureSpec) {
	return {
		schemaVersion: 1 as const,
		key: spec.key,
		title: spec.title ?? spec.key,
		category: spec.category ?? 'other',
		locale: spec.locale ?? 'fr',
		difficulty: spec.difficulty ?? 'easy',
		tags: [] as string[],
		subject: spec.subject ?? 'Message de test {{firstName}}',
		fromName: null as string | null,
		email: spec.email ?? SKELETON_EMAIL,
		landing: spec.landing ?? SKELETON_LANDING,
		awareness: spec.awareness ?? SKELETON_AWARENESS
	};
}

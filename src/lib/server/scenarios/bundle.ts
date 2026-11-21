import mjml2html from 'mjml';
import { db } from '$lib/server/db';
import { scenarios } from '$lib/server/db/schema';
import { parseTags } from '$lib/scenario-labels';
import { getScenario } from './loader';
import { loadScenarioContent } from './render';

/**
 * Format d'échange d'un scénario : un seul fichier JSON, autosuffisant. Permet
 * d'exporter un scénario (builtin ou importé) et d'en importer un sans
 * redéploiement. `schemaVersion` fige la forme du document pour les évolutions.
 */
export type Bundle = {
	schemaVersion: 1;
	key: string;
	title: string;
	category: string;
	locale: string;
	difficulty: string;
	tags: string[];
	subject: string;
	fromName: string | null;
	email: string;
	landing: string;
	awareness: string;
};

export const BUNDLE_SCHEMA_VERSION = 1 as const;

/** Clé valide : étiquette de type slug (réutilisée en sous-domaine d'aperçu, en URL). */
const KEY_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;

/**
 * Erreur d'import : message clair et actionnable, destiné à être affiché tel quel
 * à l'opérateur. Toute violation de validation lève cette erreur.
 */
export class BundleImportError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'BundleImportError';
	}
}

/**
 * Exporte un scénario en {@link Bundle}. Le contenu est lu via le pipeline de
 * rendu commun : depuis le disque pour un builtin, depuis la base pour un importé.
 */
export async function exportBundle(key: string): Promise<Bundle> {
	const scenario = getScenario(key);
	if (!scenario) throw new Error(`Scénario introuvable : ${key}`);
	const content = await loadScenarioContent(scenario);
	return {
		schemaVersion: BUNDLE_SCHEMA_VERSION,
		key: scenario.key,
		title: scenario.title,
		category: scenario.category,
		locale: scenario.locale,
		difficulty: scenario.difficulty,
		tags: parseTags(scenario.tagsJson),
		subject: content.subject,
		fromName: content.fromName ?? null,
		email: content.email,
		landing: content.landing,
		awareness: content.awareness
	};
}

/** Lit une chaîne obligatoire et non vide d'un objet, sinon lève. */
function requireString(raw: Record<string, unknown>, field: string): string {
	const value = raw[field];
	if (typeof value !== 'string' || value.trim() === '') {
		throw new BundleImportError(`Champ obligatoire manquant ou vide : « ${field} ».`);
	}
	return value;
}

/** Parse l'entrée (JSON brut ou objet déjà décodé) en objet, sinon lève. */
function parseInput(input: unknown): Record<string, unknown> {
	let value: unknown = input;
	if (typeof input === 'string') {
		try {
			value = JSON.parse(input);
		} catch {
			throw new BundleImportError('Fichier illisible : ce n’est pas du JSON valide.');
		}
	}
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new BundleImportError('Fichier invalide : un objet JSON est attendu.');
	}
	return value as Record<string, unknown>;
}

/**
 * Vérifie que la landing respecte l'invariant « zéro capture » : le formulaire
 * poste vers `{{submitUrl}}` (notre endpoint, qui ne lit rien), aucun champ n'a
 * d'attribut `name` (rien n'est soumis), et le beacon littéral
 * `navigator.sendBeacon('{{beaconUrl}}')` est présent (il ne signale que
 * l'affichage, jamais la saisie). Lève à la première violation.
 */
function validateLanding(landing: string): void {
	// Le formulaire doit poster vers la sentinelle de soumission de l'opérateur.
	if (!/<form\b[^>]*\saction\s*=\s*(["'])\{\{\s*submitUrl\s*\}\}\1/i.test(landing)) {
		throw new BundleImportError(
			'Landing refusée : le formulaire doit avoir action="{{submitUrl}}".'
		);
	}
	// Aucun champ nommé : un attribut `name` permettrait de soumettre une valeur.
	if (/<(?:input|select|textarea)\b[^>]*\sname\s*=/i.test(landing)) {
		throw new BundleImportError(
			'Landing refusée : aucun champ de formulaire ne doit porter d’attribut « name » (invariant zéro capture).'
		);
	}
	// Beacon littéral : signale uniquement l'affichage, jamais la saisie.
	if (!/navigator\.sendBeacon\(\s*(["'])\{\{\s*beaconUrl\s*\}\}\1\s*\)/.test(landing)) {
		throw new BundleImportError(
			"Landing refusée : le beacon navigator.sendBeacon('{{beaconUrl}}') est absent."
		);
	}
}

/** Vérifie que la page de sensibilisation comporte le point d'insertion du message. */
function validateAwareness(awareness: string): void {
	if (!/\{\{\s*awarenessMessage\s*\}\}/.test(awareness)) {
		throw new BundleImportError(
			'Sensibilisation refusée : le placeholder {{awarenessMessage}} est absent.'
		);
	}
}

/** Vérifie que le gabarit e-mail compile en MJML (mêmes règles que le rendu). */
async function validateEmailMjml(email: string): Promise<void> {
	let errors: { formattedMessage: string }[];
	try {
		({ errors } = await mjml2html(email, { validationLevel: 'soft' }));
	} catch (e) {
		const detail = e instanceof Error ? e.message : String(e);
		throw new BundleImportError(`E-mail refusé : le MJML ne compile pas (${detail}).`);
	}
	if (errors.length > 0) {
		const details = errors.map((error) => error.formattedMessage).join(' ; ');
		throw new BundleImportError(`E-mail refusé : le MJML ne compile pas (${details}).`);
	}
}

/**
 * Importe un scénario depuis un {@link Bundle} (JSON brut ou objet). Valide la
 * forme du document et applique TOUTES les validations de sécurité :
 * - champs obligatoires présents (schemaVersion, key, title, category, locale,
 *   difficulty, subject, email, landing, awareness) ;
 * - clé au format slug et non réservée par un scénario builtin ;
 * - invariant « zéro capture » de la landing (form → submitUrl, aucun champ
 *   nommé, beacon littéral) ;
 * - {{awarenessMessage}} présent dans la sensibilisation ;
 * - le MJML de l'e-mail compile.
 *
 * En cas de succès, insère (ou met à jour une clé déjà importée) le scénario en
 * base avec `source='imported'`, `path=null` et `enabled=true`. Renvoie la clé.
 * Lève {@link BundleImportError} (message affichable) pour toute entrée invalide.
 */
export async function importBundle(input: unknown): Promise<{ key: string }> {
	const raw = parseInput(input);

	if (raw.schemaVersion !== BUNDLE_SCHEMA_VERSION) {
		throw new BundleImportError(
			`Version de schéma non prise en charge : ${String(raw.schemaVersion)} (attendu : ${BUNDLE_SCHEMA_VERSION}).`
		);
	}

	const key = requireString(raw, 'key');
	if (!KEY_RE.test(key)) {
		throw new BundleImportError(
			'Clé invalide : minuscules, chiffres et tirets uniquement (ex. « mon-scenario »).'
		);
	}

	const title = requireString(raw, 'title');
	const category = requireString(raw, 'category');
	const locale = requireString(raw, 'locale');
	const difficulty = requireString(raw, 'difficulty');
	const subject = requireString(raw, 'subject');
	const email = requireString(raw, 'email');
	const landing = requireString(raw, 'landing');
	const awareness = requireString(raw, 'awareness');

	const tags =
		raw.tags === undefined || raw.tags === null
			? []
			: Array.isArray(raw.tags)
				? raw.tags.map(String)
				: (() => {
						throw new BundleImportError('Champ « tags » invalide : un tableau est attendu.');
					})();

	const fromName =
		raw.fromName === undefined || raw.fromName === null ? null : String(raw.fromName);

	// Une clé réservée par un scénario livré (builtin) ne peut pas être écrasée :
	// renommer l'import. Une clé déjà importée est, elle, mise à jour.
	const existing = getScenario(key);
	if (existing && existing.source === 'builtin') {
		throw new BundleImportError(
			`La clé « ${key} » est déjà utilisée par un scénario livré. Renommez l’import.`
		);
	}

	validateLanding(landing);
	validateAwareness(awareness);
	await validateEmailMjml(email);

	db.insert(scenarios)
		.values({
			key,
			title,
			category,
			locale,
			difficulty,
			tagsJson: JSON.stringify(tags),
			source: 'imported',
			path: null,
			subject,
			fromName,
			emailTemplate: email,
			landingTemplate: landing,
			awarenessTemplate: awareness,
			enabled: true
		})
		.onConflictDoUpdate({
			target: scenarios.key,
			set: {
				title,
				category,
				locale,
				difficulty,
				tagsJson: JSON.stringify(tags),
				source: 'imported',
				path: null,
				subject,
				fromName,
				emailTemplate: email,
				landingTemplate: landing,
				awarenessTemplate: awareness,
				enabled: true
			}
		})
		.run();

	return { key };
}

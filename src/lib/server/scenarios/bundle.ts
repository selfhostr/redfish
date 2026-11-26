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
	/** Comportement après le clic : `awareness` (défaut) ou `redirect`. */
	landingMode: 'awareness' | 'redirect';
	/** URL absolue http(s) de redirection en mode `redirect` ; NULL sinon. */
	landingRedirectUrl: string | null;
	/** Pièce jointe piégée : `none` (défaut), `html` (beacon d'ouverture) ou `pdf` (lien cliquable). */
	attachmentMode: 'none' | 'html' | 'pdf';
	/** Nom du fichier joint (requis en `html`/`pdf`) ; NULL en `none`. */
	attachmentFilename: string | null;
	/** Gabarit de la PJ : corps HTML (`html`) ou texte visible (`pdf`) ; NULL en `none`. */
	attachmentTemplate: string | null;
};

export const BUNDLE_SCHEMA_VERSION = 1 as const;

/**
 * Vrai si `value` est une URL absolue en http(s). Utilisé à l'import (validation
 * d'un bundle) ET au moment de la redirection (défense en profondeur côté `/t`).
 */
export function isValidLandingRedirectUrl(value: string): boolean {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		return false;
	}
	return url.protocol === 'http:' || url.protocol === 'https:';
}

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
		awareness: content.awareness,
		landingMode: scenario.landingMode,
		landingRedirectUrl: scenario.landingRedirectUrl ?? null,
		attachmentMode: scenario.attachmentMode,
		attachmentFilename: scenario.attachmentFilename ?? null,
		attachmentTemplate: scenario.attachmentTemplate ?? null
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
export function validateLanding(landing: string): void {
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
export function validateAwareness(awareness: string): void {
	if (!/\{\{\s*awarenessMessage\s*\}\}/.test(awareness)) {
		throw new BundleImportError(
			'Sensibilisation refusée : le placeholder {{awarenessMessage}} est absent.'
		);
	}
}

/**
 * Vérifie une pièce jointe piégée. En `none`, les champs sont ignorés (aucune
 * contrainte). En `html`/`pdf`, un nom de fichier est requis. En `html`,
 * l'invariant « zéro capture » s'applique au gabarit : AUCUN champ de formulaire
 * (interdiction de `form`/`input`/`select`/`textarea`/`button`), et le beacon
 * `<img src="{{attachmentOpen}}" …>` doit être présent (il ne signale que
 * l'ouverture du fichier, jamais la moindre saisie). Lève à la première violation.
 */
export function validateAttachment(
	mode: string,
	filename: string | null,
	template: string | null
): void {
	if (mode === 'none') return;
	if (mode !== 'html' && mode !== 'pdf') {
		throw new BundleImportError(
			'Mode de pièce jointe invalide : « none », « html » ou « pdf » attendu.'
		);
	}
	if (!filename || filename.trim() === '') {
		throw new BundleImportError(
			'Pièce jointe refusée : un nom de fichier est requis en mode « html » ou « pdf ».'
		);
	}
	if (mode === 'pdf') return;

	const html = template ?? '';
	// Aucun champ de formulaire : rien ne doit pouvoir capturer une saisie.
	if (/<(?:form|input|select|textarea|button)\b/i.test(html)) {
		throw new BundleImportError(
			'Pièce jointe refusée : aucun champ de formulaire n’est autorisé dans la PJ HTML (invariant zéro capture).'
		);
	}
	// Beacon d'ouverture : une image pointant vers l'URL de suivi {{attachmentOpen}}.
	if (!/<img\b[^>]*\ssrc\s*=\s*(["'])\{\{\s*attachmentOpen\s*\}\}\1/i.test(html)) {
		throw new BundleImportError(
			'Pièce jointe refusée : le beacon d’ouverture <img src="{{attachmentOpen}}"> est absent.'
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

	// Comportement après le clic. Absent → `awareness` (rétrocompatibilité des
	// anciens bundles). En mode `redirect`, l'URL est obligatoire et doit être
	// absolue en http(s) ; en mode `awareness`, toute URL fournie est ignorée.
	const landingMode =
		raw.landingMode === undefined || raw.landingMode === null
			? 'awareness'
			: String(raw.landingMode);
	if (landingMode !== 'awareness' && landingMode !== 'redirect') {
		throw new BundleImportError(
			'Mode d’atterrissage invalide : « awareness » ou « redirect » attendu.'
		);
	}
	let landingRedirectUrl: string | null = null;
	if (landingMode === 'redirect') {
		const rawUrl = raw.landingRedirectUrl;
		if (typeof rawUrl !== 'string' || rawUrl.trim() === '') {
			throw new BundleImportError(
				'URL de redirection manquante : en mode « Redirection sans message », une URL http(s) absolue est requise.'
			);
		}
		const url = rawUrl.trim();
		if (!isValidLandingRedirectUrl(url)) {
			throw new BundleImportError(
				'URL de redirection invalide : une URL absolue en http(s) est attendue (ex. « https://exemple.test »).'
			);
		}
		landingRedirectUrl = url;
	}

	// Pièce jointe piégée. Absente → `none` (rétrocompatibilité des anciens
	// bundles). En `html`/`pdf`, un nom de fichier est requis ; en `html`, le
	// gabarit doit respecter l'invariant « zéro capture ». En `none`, les champs
	// de PJ sont ignorés et stockés à NULL.
	const attachmentMode =
		raw.attachmentMode === undefined || raw.attachmentMode === null
			? 'none'
			: String(raw.attachmentMode);
	if (attachmentMode !== 'none' && attachmentMode !== 'html' && attachmentMode !== 'pdf') {
		throw new BundleImportError(
			'Mode de pièce jointe invalide : « none », « html » ou « pdf » attendu.'
		);
	}
	let attachmentFilename: string | null = null;
	let attachmentTemplate: string | null = null;
	if (attachmentMode !== 'none') {
		attachmentFilename =
			typeof raw.attachmentFilename === 'string' ? raw.attachmentFilename.trim() : '';
		attachmentTemplate =
			raw.attachmentTemplate === undefined || raw.attachmentTemplate === null
				? ''
				: String(raw.attachmentTemplate);
	}
	validateAttachment(attachmentMode, attachmentFilename, attachmentTemplate);

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
			landingMode,
			landingRedirectUrl,
			attachmentMode,
			attachmentFilename,
			attachmentTemplate,
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
				landingMode,
				landingRedirectUrl,
				attachmentMode,
				attachmentFilename,
				attachmentTemplate,
				enabled: true,
				archivedAt: null
			}
		})
		.run();

	return { key };
}

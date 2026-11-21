import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import mjml2html from 'mjml';
import type { Scenario } from '$lib/server/db/schema';
import type { Manifest } from './types';
import { parseManifest } from './loader';

/**
 * Contexte de rendu d'un envoi : le destinataire et les URLs de tracking de
 * l'opérateur (les nôtres). Aucune valeur saisie par la cible n'y figure :
 * la plateforme ne lit ni ne stocke jamais ce qui est tapé dans la page.
 */
export type RenderCtx = {
	firstName: string;
	lastName: string;
	email: string;
	awarenessMessage?: string;
	urls: {
		open: string;
		click: string;
		submit: string;
		beacon: string;
		awareness: string;
	};
};

/** Échappe les cinq caractères dangereux en HTML (`& < > " '`). */
export function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

/**
 * Remplace chaque `{{clé}}` par la chaîne fournie telle quelle ; une clé absente
 * de `values` devient une chaîne vide. L'insertion est brute : c'est à l'appelant
 * d'échapper le texte (via {@link escapeHtml}) et de laisser les URLs intactes.
 */
function substitute(src: string, values: Record<string, string>): string {
	return src.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, key: string) =>
		Object.prototype.hasOwnProperty.call(values, key) ? values[key] : ''
	);
}

/**
 * Interpole `{{clé}}` → valeur ÉCHAPPÉE en HTML ; une clé inconnue devient une
 * chaîne vide. À utiliser pour toute interpolation de TEXTE.
 */
export function renderTemplate(src: string, vars: Record<string, string>): string {
	const escaped: Record<string, string> = {};
	for (const [key, value] of Object.entries(vars)) {
		escaped[key] = escapeHtml(value);
	}
	return substitute(src, escaped);
}

/** Lit un fichier du paquet de scénario (dossier local de confiance). */
async function readTemplateFile(scenario: Scenario, file: string): Promise<string> {
	return readFile(join(scenario.path, file), 'utf8');
}

/** Relit et valide le manifeste du paquet (noms de gabarits + sujet). */
async function readManifest(scenario: Scenario): Promise<Manifest> {
	return parseManifest(await readTemplateFile(scenario, 'manifest.yaml'));
}

/**
 * Rend l'e-mail d'un scénario. Interpole `{{firstName}}` (échappé en HTML) et
 * les URLs de tracking `{{clickUrl}}`/`{{openUrl}}` (brutes : ce sont nos propres
 * URLs, le jeton est en base64url), puis compile le MJML en HTML. Lève si MJML
 * renvoie des erreurs. Le sujet provient du manifeste et est interpolé BRUT
 * (en-tête de mail en texte, pas de HTML).
 */
export async function renderEmail(
	scenario: Scenario,
	ctx: RenderCtx
): Promise<{ subject: string; html: string }> {
	const manifest = await readManifest(scenario);
	const source = await readTemplateFile(scenario, manifest.templates.email);

	const mjmlSource = substitute(source, {
		firstName: escapeHtml(ctx.firstName),
		clickUrl: ctx.urls.click,
		openUrl: ctx.urls.open
	});

	const { html, errors } = await mjml2html(mjmlSource, { validationLevel: 'soft' });
	if (errors.length > 0) {
		const details = errors.map((error) => error.formattedMessage).join(' ; ');
		throw new Error(`Compilation MJML échouée : ${details}`);
	}

	// Le sujet est un en-tête de mail en TEXTE BRUT : substitution non échappée
	// (sinon un prénom « A&B » deviendrait « A&amp;B » dans le sujet reçu).
	// On retire néanmoins les CR/LF : un en-tête ne tient que sur une ligne, et
	// les laisser passer permettrait une injection d'en-têtes (Bcc, etc.).
	const subject = substitute(manifest.subject, {
		firstName: ctx.firstName,
		lastName: ctx.lastName,
		email: ctx.email
	}).replace(/[\r\n]+/g, ' ');

	return { subject, html };
}

/**
 * Rend la page d'atterrissage. `{{submitUrl}}`/`{{beaconUrl}}` sont insérées
 * brutes, `{{firstName}}` est échappé. Les propriétés « zéro capture » du gabarit
 * sont conservées (action du formulaire = URL de soumission, aucun champ nommé,
 * beacon sans corps) : cette fonction ne fait que de l'interpolation.
 */
export async function renderLanding(scenario: Scenario, ctx: RenderCtx): Promise<string> {
	const manifest = await readManifest(scenario);
	const source = await readTemplateFile(scenario, manifest.templates.landing);
	return substitute(source, {
		firstName: escapeHtml(ctx.firstName),
		awarenessMessage: escapeHtml(ctx.awarenessMessage ?? ''),
		submitUrl: ctx.urls.submit,
		beaconUrl: ctx.urls.beacon
	});
}

/**
 * Rend la page de sensibilisation (le débrief pédagogique). Affiche
 * `ctx.awarenessMessage` quand il est défini (vide sinon) ; `{{firstName}}` est
 * échappé.
 */
export async function renderAwareness(scenario: Scenario, ctx: RenderCtx): Promise<string> {
	const manifest = await readManifest(scenario);
	const source = await readTemplateFile(scenario, manifest.templates.awareness);
	return substitute(source, {
		firstName: escapeHtml(ctx.firstName),
		awarenessMessage: escapeHtml(ctx.awarenessMessage ?? ''),
		beaconUrl: ctx.urls.beacon
	});
}

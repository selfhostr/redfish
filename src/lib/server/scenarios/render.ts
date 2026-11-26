import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import mjml2html from 'mjml';
import type { Scenario } from '$lib/server/db/schema';
import { parseManifest } from './loader';
import { QR_IMG_HTML } from './qr';

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
		report: string;
		/** Beacon d'ouverture de la pièce jointe HTML (événement `attachment_opened`). */
		attachmentOpen: string;
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
 * Les clés reconnues par gabarit sont recensées dans
 * `$lib/scenarios/placeholders` (à tenir synchronisé).
 */
export function substitute(src: string, values: Record<string, string>): string {
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

/**
 * Contenu interpolable d'un scénario : sujet, nom d'expéditeur et les trois
 * gabarits (e-mail, landing, sensibilisation). Un scénario `builtin` le lit
 * depuis son paquet sur disque ; un scénario `imported` le lit depuis les
 * colonnes de la base (l'image Docker est figée et le worker ne partage pas le
 * disque du web : le contenu importé doit vivre en base). L'éditeur de création
 * en fournit un en mémoire, non enregistré, pour l'aperçu en direct.
 */
export type ScenarioContent = {
	subject: string;
	fromName?: string;
	email: string;
	landing: string;
	awareness: string;
	/** Comportement après le clic (voir la table `scenarios`). */
	landingMode?: 'awareness' | 'redirect';
	/** URL absolue http(s) de redirection en mode `redirect` ; NULL sinon. */
	landingRedirectUrl?: string | null;
	/** Mode de pièce jointe piégée (voir la table `scenarios`). */
	attachmentMode: 'none' | 'html' | 'pdf';
	/** Nom du fichier joint (modes `html`/`pdf`) ; NULL en `none`. */
	attachmentFilename: string | null;
	/** Gabarit de la PJ : corps HTML (`html`) ou texte visible (`pdf`) ; NULL en `none`. */
	attachmentTemplate: string | null;
	/** QR code dans l'e-mail (« quishing ») : `{{qrCode}}` encode l'URL de clic. */
	includeQr: boolean;
};

/** Vrai si le contenu vit en base (scénario importé) plutôt que sur disque. */
function isImported(scenario: Scenario): boolean {
	return scenario.source === 'imported' || scenario.path === null;
}

/**
 * Charge le contenu d'un scénario, quelle que soit sa source. Point d'entrée
 * unique du pipeline de rendu : e-mail (worker), landing et sensibilisation en
 * dépendent tous, de sorte qu'un scénario importé se rend exactement comme un
 * builtin.
 */
export async function loadScenarioContent(scenario: Scenario): Promise<ScenarioContent> {
	if (isImported(scenario)) {
		return {
			subject: scenario.subject ?? '',
			fromName: scenario.fromName ?? undefined,
			email: scenario.emailTemplate ?? '',
			landing: scenario.landingTemplate ?? '',
			awareness: scenario.awarenessTemplate ?? '',
			landingMode: scenario.landingMode,
			landingRedirectUrl: scenario.landingRedirectUrl,
			attachmentMode: scenario.attachmentMode,
			attachmentFilename: scenario.attachmentFilename,
			attachmentTemplate: scenario.attachmentTemplate,
			includeQr: scenario.includeQr
		};
	}
	const path = scenario.path as string;
	const manifest = parseManifest(await readFile(join(path, 'manifest.yaml'), 'utf8'));
	// Un gabarit absent du manifeste reste une chaîne vide (plutôt que de lire le dossier).
	const read = (name: string) => (name ? readFile(join(path, name), 'utf8') : Promise.resolve(''));
	const [email, landing, awareness] = await Promise.all([
		read(manifest.templates.email),
		read(manifest.templates.landing),
		read(manifest.templates.awareness)
	]);
	return {
		subject: manifest.subject,
		fromName: manifest.fromName,
		email,
		landing,
		awareness,
		landingMode: scenario.landingMode,
		landingRedirectUrl: scenario.landingRedirectUrl,
		// Les champs de PJ vivent dans la ligne `scenarios` quelle que soit la source
		// (comme `landingMode`) : un paquet builtin sur disque n'en décrit aucun.
		attachmentMode: scenario.attachmentMode,
		attachmentFilename: scenario.attachmentFilename,
		attachmentTemplate: scenario.attachmentTemplate,
		includeQr: scenario.includeQr
	};
}

/**
 * Erreur de compilation MJML. `details` liste les messages de MJML un par un
 * (affichage détaillé dans l'éditeur) ; `message` les concatène.
 */
export class MjmlCompileError extends Error {
	readonly details: string[];
	constructor(details: string[]) {
		super(`Compilation MJML échouée : ${details.join(' ; ')}`);
		this.name = 'MjmlCompileError';
		this.details = details;
	}
}

/**
 * Rend le sujet. C'est un en-tête de mail en TEXTE BRUT : substitution non
 * échappée (sinon un prénom « A&B » deviendrait « A&amp;B » dans le sujet reçu).
 * On retire néanmoins les CR/LF : un en-tête ne tient que sur une ligne, et les
 * laisser passer permettrait une injection d'en-têtes (Bcc, etc.).
 */
export function renderSubjectContent(
	content: Pick<ScenarioContent, 'subject'>,
	ctx: RenderCtx
): string {
	return substitute(content.subject, {
		firstName: ctx.firstName,
		lastName: ctx.lastName,
		email: ctx.email
	}).replace(/[\r\n]+/g, ' ');
}

/**
 * Rend l'e-mail à partir d'un contenu en mémoire. Interpole `{{firstName}}`
 * (échappé en HTML) et les URLs de tracking `{{clickUrl}}`/`{{openUrl}}`/`{{reportUrl}}`
 * (brutes : ce sont nos propres URLs, le jeton est en base64url), puis compile
 * le MJML en HTML. Lève {@link MjmlCompileError} si MJML renvoie des erreurs.
 */
export async function renderEmailContent(
	content: Pick<ScenarioContent, 'subject' | 'email' | 'includeQr'>,
	ctx: RenderCtx
): Promise<{ subject: string; html: string }> {
	const mjmlSource = substitute(content.email, {
		firstName: escapeHtml(ctx.firstName),
		clickUrl: ctx.urls.click,
		openUrl: ctx.urls.open,
		reportUrl: ctx.urls.report,
		// QR code (« quishing ») : image inline (cid) encodant l'URL de clic, insérée
		// à l'envoi (cf. handler send-email). Vide quand `include_qr` est inactif.
		qrCode: content.includeQr ? QR_IMG_HTML : ''
	});

	const { html, errors } = await mjml2html(mjmlSource, { validationLevel: 'soft' });
	if (errors.length > 0) {
		throw new MjmlCompileError(errors.map((error) => error.formattedMessage));
	}

	return { subject: renderSubjectContent(content, ctx), html };
}

/**
 * Rend la page d'atterrissage à partir d'un contenu en mémoire.
 * `{{submitUrl}}`/`{{beaconUrl}}` sont insérées brutes, `{{firstName}}` est
 * échappé. Les propriétés « zéro capture » du gabarit sont conservées (action du
 * formulaire = URL de soumission, aucun champ nommé, beacon sans corps) : cette
 * fonction ne fait que de l'interpolation.
 */
export function renderLandingContent(
	content: Pick<ScenarioContent, 'landing'>,
	ctx: RenderCtx
): string {
	return substitute(content.landing, {
		firstName: escapeHtml(ctx.firstName),
		awarenessMessage: escapeHtml(ctx.awarenessMessage ?? ''),
		submitUrl: ctx.urls.submit,
		beaconUrl: ctx.urls.beacon
	});
}

/**
 * Rend la page de sensibilisation (le débrief pédagogique) à partir d'un contenu
 * en mémoire. Affiche `ctx.awarenessMessage` quand il est défini (vide sinon) ;
 * `{{firstName}}` est échappé.
 */
export function renderAwarenessContent(
	content: Pick<ScenarioContent, 'awareness'>,
	ctx: RenderCtx
): string {
	return substitute(content.awareness, {
		firstName: escapeHtml(ctx.firstName),
		awarenessMessage: escapeHtml(ctx.awarenessMessage ?? ''),
		beaconUrl: ctx.urls.beacon
	});
}

/** Rend l'e-mail d'un scénario (voir {@link renderEmailContent}). */
export async function renderEmail(
	scenario: Scenario,
	ctx: RenderCtx
): Promise<{ subject: string; html: string }> {
	return renderEmailContent(await loadScenarioContent(scenario), ctx);
}

/** Rend la page d'atterrissage d'un scénario (voir {@link renderLandingContent}). */
export async function renderLanding(scenario: Scenario, ctx: RenderCtx): Promise<string> {
	return renderLandingContent(await loadScenarioContent(scenario), ctx);
}

/** Rend la page de sensibilisation d'un scénario (voir {@link renderAwarenessContent}). */
export async function renderAwareness(scenario: Scenario, ctx: RenderCtx): Promise<string> {
	return renderAwarenessContent(await loadScenarioContent(scenario), ctx);
}

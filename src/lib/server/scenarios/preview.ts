import type { Scenario } from '$lib/server/db/schema';
import { isSubmitControl, PREVIEW_MARKER_ATTR, PREVIEW_MARKERS } from '$lib/preview-nav';
import {
	findUnknownPlaceholders,
	TEMPLATE_LABELS,
	type TemplateField
} from '$lib/scenarios/placeholders';
import {
	loadScenarioContent,
	MjmlCompileError,
	renderAwarenessContent,
	renderEmailContent,
	renderLandingContent,
	renderSubjectContent
} from './render';
import type { RenderCtx, ScenarioContent } from './render';

/**
 * Aperçu « maquette » d'un scénario pour le dashboard (faux webmail : boîte de
 * réception → e-mail → clic → page de destination → page de sensibilisation).
 *
 * Purement visuel : destinataire fictif, AUCUN jeton, AUCUNE écriture en base,
 * AUCUNE URL de tracking. Chaque HTML produit passe par
 * {@link sanitizePreviewHtml}, qui garantit pour le document émis :
 * - ni `<script>`, ni attribut `on*`, ni cadre ou objet (`iframe`, `frame`,
 *   `object`, `embed`, `portal`, `fencedframe`), ni `<base>`, `<link>`,
 *   `<noscript>`, animation SVG, commentaire ; aucun `<meta http-equiv>` hormis
 *   la CSP injectée ;
 * - AUCUN attribut `href` ni `xlink:href` (ni `*:href`) : rien n'est navigable,
 *   même sans JS (dans un `srcdoc`, même `#…` se résout contre l'URL du
 *   dashboard). Les liens vers la sentinelle de clic deviennent des éléments
 *   marqués `data-rf-preview="click"` (avec `cursor:pointer`, `tabindex="0"` et `role="link"`), les contrôles
 *   d'envoi portent `data-rf-preview="submit"` ; l'UI décide de l'étape
 *   (`decideNav`). Un `data-rf-preview` présent en entrée est retiré ;
 * - ressources (`src`, `poster`, `background`) limitées aux images raster
 *   `data:` en base64 ; `srcset`, `ping`, `formaction`, `attributionsrc`… retirés ;
 * - formulaires : action forcée sur la sentinelle de soumission, méthode GET,
 *   aucun attribut `name` sur les champs ;
 * - CSS (`<style>`, `style=""`, attributs de présentation) : voir
 *   {@link sanitizeCss} (aucune fonction de chargement hors `url(#id)` et images
 *   `data:` raster, aucun `@import`, échec fermé) ;
 * - une meta CSP restrictive ({@link PREVIEW_CSP}), premier élément du `<head>`
 *   effectif.
 * L'UI affiche ces documents dans des iframes `sandbox="allow-same-origin"`
 * (ni scripts, ni formulaires, ni navigation du parent, ni fenêtres) et annule
 * tout clic. Le texte et la mise en forme du scénario restent, eux, libres.
 */

/**
 * Sentinelles insérées à la place des URLs de tracking lors du rendu. Le lien
 * `click` (e-mail → landing) est ensuite converti en élément marqué, sans href ;
 * l'action des formulaires vaut `submit` (landing → sensibilisation).
 */
export const PREVIEW_SENTINELS = {
	click: '#rf-preview-click',
	submit: '#rf-preview-submit',
	awareness: '#rf-preview-awareness',
	report: '#rf-preview-report'
} as const;

/** Destinataire fictif de l'aperçu (domaine réservé `.invalid`, RFC 2606). */
export const PREVIEW_RECIPIENT = {
	firstName: 'Camille',
	lastName: 'Exemple',
	email: 'camille.exemple@organisation.invalid'
} as const;

/** Date de réception fixe par défaut (aperçu déterministe). */
export const PREVIEW_RECEIVED_AT = '2026-03-12T08:47:00.000Z';

const PREVIEW_AWARENESS_MESSAGE =
	"Aperçu : la note de sensibilisation propre à chaque campagne s'affiche ici.";

/** GIF 1×1 transparent : remplace le pixel d'ouverture (aucun appel réseau). */
const TRANSPARENT_PIXEL =
	'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';

/**
 * CSP injectée en tête de chaque document d'aperçu (défense en profondeur, en
 * plus de l'assainissement) : aucun script, aucune ressource hors `data:`, aucune
 * soumission de formulaire.
 */
export const PREVIEW_CSP =
	"default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:; form-action 'none'; base-uri 'none'";

export type ScenarioPreview = {
	/** Sujet du message, interpolé pour le destinataire fictif (texte brut). */
	subject: string;
	/** Nom d'expéditeur affiché (manifeste `fromName`, à défaut le titre). */
	fromName: string;
	/** Adresse d'expéditeur fictive, toujours sous le domaine `.invalid`. */
	fromAddress: string;
	recipient: { firstName: string; lastName: string; email: string };
	/** Date de réception au format ISO 8601. */
	receivedAt: string;
	/** Documents HTML complets et assainis, destinés à des iframes `srcdoc`. */
	emailHtml: string;
	landingHtml: string;
	awarenessHtml: string;
};

export type ScenarioPreviewOptions = {
	/** Date de réception affichée ; {@link PREVIEW_RECEIVED_AT} par défaut. */
	receivedAt?: Date;
	/** Note de sensibilisation à afficher (échappée) ; texte d'exemple par défaut. */
	awarenessMessage?: string;
};

/** Étiquette DNS dérivée de la clé du scénario (`[a-z0-9-]`, 63 caractères max). */
function domainLabel(key: string): string {
	const label = key
		.toLowerCase()
		.replace(/[^a-z0-9-]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 63)
		.replace(/-+$/g, '');
	return label || 'expediteur';
}

/** Identité affichée de l'expéditeur : clé (domaine fictif) et titre de repli. */
export type PreviewIdentity = { key: string; title?: string | null };

/** Contexte de rendu de l'aperçu : destinataire fictif, URLs sentinelles. */
function previewCtx(options: ScenarioPreviewOptions): RenderCtx {
	return {
		...PREVIEW_RECIPIENT,
		awarenessMessage: options.awarenessMessage ?? PREVIEW_AWARENESS_MESSAGE,
		urls: {
			open: TRANSPARENT_PIXEL,
			click: PREVIEW_SENTINELS.click,
			submit: PREVIEW_SENTINELS.submit,
			beacon: '',
			awareness: PREVIEW_SENTINELS.awareness,
			report: PREVIEW_SENTINELS.report
		}
	};
}

/**
 * Assemble l'aperçu. POINT DE PASSAGE UNIQUE vers le client : chaque document
 * HTML y passe par {@link sanitizePreviewHtml} (CSP comprise), quelle que soit
 * l'origine du contenu (paquet, base ou brouillon de l'éditeur).
 */
function assemblePreview(
	identity: PreviewIdentity,
	content: ScenarioContent,
	ctx: RenderCtx,
	email: { subject: string; html: string },
	options: ScenarioPreviewOptions
): ScenarioPreview {
	const key = identity.key;
	const fromName =
		(content.fromName ?? identity.title ?? key).replace(/[\r\n]+/g, ' ').trim() ||
		key ||
		'Expéditeur';

	return {
		subject: email.subject,
		fromName,
		fromAddress: `ne-pas-repondre@${domainLabel(key)}.invalid`,
		recipient: { ...PREVIEW_RECIPIENT },
		receivedAt: options.receivedAt ? options.receivedAt.toISOString() : PREVIEW_RECEIVED_AT,
		emailHtml: sanitizePreviewHtml(email.html),
		landingHtml: sanitizePreviewHtml(renderLandingContent(content, ctx)),
		awarenessHtml: sanitizePreviewHtml(renderAwarenessContent(content, ctx))
	};
}

/**
 * Rend l'aperçu complet d'un contenu en mémoire, avec un destinataire fictif et
 * des URLs sentinelles. Fonction pure : n'écrit rien et ne crée aucun jeton ni
 * événement. Lève si le MJML de l'e-mail ne compile pas.
 */
export async function renderContentPreview(
	identity: PreviewIdentity,
	content: ScenarioContent,
	options: ScenarioPreviewOptions = {}
): Promise<ScenarioPreview> {
	const ctx = previewCtx(options);
	const email = await renderEmailContent(content, ctx);
	return assemblePreview(identity, content, ctx, email, options);
}

/**
 * Rend l'aperçu complet d'un scénario persisté (paquet sur disque ou base).
 * Fonction pure : ne lit que le contenu du scénario, n'écrit rien et ne crée
 * aucun jeton ni événement.
 */
export async function renderScenarioPreview(
	scenario: Scenario,
	options: ScenarioPreviewOptions = {}
): Promise<ScenarioPreview> {
	const content = await loadScenarioContent(scenario);
	return renderContentPreview({ key: scenario.key, title: scenario.title }, content, options);
}

/** Problème détecté dans un brouillon, rattaché au gabarit concerné. */
export type DraftIssue = {
	field: TemplateField;
	/** Message court, en français, affichable tel quel. */
	message: string;
	/** Détails éventuels (une ligne par erreur MJML). */
	details?: string[];
};

/** Document affiché à la place de l'e-mail quand son MJML ne compile pas. */
const EMAIL_ERROR_HTML =
	'<!doctype html><html><body style="font-family:sans-serif;padding:16px">' +
	'<p>L’e-mail ne compile pas : corrigez les erreurs MJML signalées.</p></body></html>';

/**
 * Aperçu d'un BROUILLON (éditeur de création) : comme {@link renderContentPreview},
 * mais ne lève jamais pour un contenu invalide. Les erreurs MJML et les variables
 * inconnues sont renvoyées dans `issues` ; l'e-mail non compilable est remplacé
 * par un document d'information, le reste de l'aperçu reste rendu. Mêmes
 * garanties d'assainissement et de CSP que l'aperçu d'un scénario enregistré.
 */
export async function renderDraftPreview(
	identity: PreviewIdentity,
	content: ScenarioContent,
	options: ScenarioPreviewOptions = {}
): Promise<{ preview: ScenarioPreview; issues: DraftIssue[] }> {
	const issues: DraftIssue[] = [];
	const fields: TemplateField[] = ['subject', 'email', 'landing', 'awareness'];
	for (const field of fields) {
		const unknown = findUnknownPlaceholders(content[field], field);
		if (unknown.length > 0) {
			const list = unknown.map((k) => `{{${k}}}`).join(', ');
			issues.push({
				field,
				message: `${TEMPLATE_LABELS[field]} : variable${unknown.length > 1 ? 's' : ''} inconnue${unknown.length > 1 ? 's' : ''} ${list} (rendue${unknown.length > 1 ? 's' : ''} vide${unknown.length > 1 ? 's' : ''}).`
			});
		}
	}

	const ctx = previewCtx(options);
	let email: { subject: string; html: string };
	try {
		email = await renderEmailContent(content, ctx);
	} catch (e) {
		const details =
			e instanceof MjmlCompileError ? e.details : [e instanceof Error ? e.message : String(e)];
		issues.push({ field: 'email', message: 'E-mail : le MJML ne compile pas.', details });
		email = { subject: renderSubjectContent(content, ctx), html: EMAIL_ERROR_HTML };
	}

	return { preview: assemblePreview(identity, content, ctx, email, options), issues };
}

// ---------------------------------------------------------------------------
// Assainissement HTML
//
// Approche : tokenisation (fidèle aux règles du tokenizer HTML pour les balises,
// attributs, commentaires et éléments à texte brut) puis RE-SÉRIALISATION
// complète. Le navigateur ne voit donc que ce que nous émettons : texte avec `<`
// et `>` échappés, balises et attributs filtrés, aucun commentaire. Aucun
// attribut de navigation (`href`) n'est émis ; pour les ressources, seules les
// images `data:` raster survivent.
// ---------------------------------------------------------------------------

/** Éléments à texte brut supprimés AVEC leur contenu. */
const DROP_WITH_CONTENT = new Set(['script', 'iframe', 'noembed', 'noframes', 'xmp']);
/** Éléments RCDATA : contenu conservé comme texte (échappé). */
const RCDATA = new Set(['title', 'textarea']);
/** Balises supprimées (le contenu éventuel est assaini et conservé). */
const DROP_TAG = new Set([
	'base',
	'link',
	'embed',
	'object',
	'applet',
	'param',
	'frame',
	'frameset',
	'portal',
	'fencedframe',
	'noscript',
	// Animations SVG : `<set attributeName="href" to="javascript:…">`.
	'set',
	'animate',
	'animatemotion',
	'animatetransform',
	'discard'
]);
/** Champs de formulaire : aucun attribut `name` (invariant « zéro capture »). */
const FORM_FIELDS = new Set([
	'input',
	'select',
	'textarea',
	'button',
	'form',
	'fieldset',
	'output'
]);
/** Attributs toujours retirés (réseau, navigation, ou vol de focus). */
const DROP_ATTRS = new Set([
	'action',
	'method',
	'target',
	'ping',
	'download',
	'formaction',
	'formtarget',
	'formmethod',
	'formenctype',
	'srcset',
	'imagesrcset',
	'srcdoc',
	'data',
	'codebase',
	'classid',
	'archive',
	'longdesc',
	'lowsrc',
	'dynsrc',
	'manifest',
	'icon',
	'profile',
	'http-equiv',
	'autofocus',
	// Attribution Reporting : requête d'arrière-plan vers l'URL indiquée.
	'attributionsrc'
]);
/** Attributs de ressource : seule une image `data:` est admise. */
const RESOURCE_ATTRS = new Set(['src', 'poster', 'background']);

const VALID_TAG = /^[A-Za-z][A-Za-z0-9-]*(?::[A-Za-z][A-Za-z0-9-]*)?$/;
const VALID_ATTR = /^[A-Za-z_:][-A-Za-z0-9_:.]*$/;
const FRAGMENT_URL = /^#[A-Za-z0-9_.:-]*$/;
const DATA_IMAGE_URL = /^data:image\/(?:png|gif|jpe?g|webp|avif|bmp);base64,[A-Za-z0-9+/]+={0,2}$/i;

const CSP_META = `<meta http-equiv="Content-Security-Policy" content="${PREVIEW_CSP}">`;

function isWs(c: string | undefined): boolean {
	return c === ' ' || c === '\t' || c === '\n' || c === '\f' || c === '\r';
}

function isAlpha(c: string | undefined): boolean {
	return c !== undefined && /^[A-Za-z]$/.test(c);
}

function escapeText(text: string): string {
	return text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/"/g, '&quot;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}

/** Valeur brute (références de caractères intactes) re-citée entre guillemets doubles. */
function escapeRawAttr(raw: string): string {
	return raw.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

type RawAttr = { name: string; raw: string | null };
type TagRest = { attrs: RawAttr[]; selfClosing: boolean; end: number };

/**
 * Lit les attributs d'une balise à partir de `i` (juste après son nom) jusqu'au
 * `>` final, selon les états « attribute name/value » du tokenizer HTML. Renvoie
 * `null` si la balise n'est pas fermée avant la fin du document (le navigateur
 * l'abandonne alors).
 */
function readTagRest(s: string, start: number): TagRest | null {
	const attrs: RawAttr[] = [];
	const n = s.length;
	let i = start;
	while (i < n) {
		const c = s[i];
		if (isWs(c)) {
			i++;
			continue;
		}
		if (c === '/') {
			if (s[i + 1] === '>') return { attrs, selfClosing: true, end: i + 2 };
			i++;
			continue;
		}
		if (c === '>') return { attrs, selfClosing: false, end: i + 1 };

		// Nom d'attribut (un `=` en première position fait partie du nom).
		let j = i + 1;
		while (j < n && !isWs(s[j]) && s[j] !== '/' && s[j] !== '>' && s[j] !== '=') j++;
		const name = s.slice(i, j);
		i = j;
		while (i < n && isWs(s[i])) i++;
		if (s[i] !== '=') {
			attrs.push({ name, raw: null });
			continue;
		}
		i++;
		while (i < n && isWs(s[i])) i++;
		const q = s[i];
		if (q === '"' || q === "'") {
			const close = s.indexOf(q, i + 1);
			if (close < 0) return null;
			attrs.push({ name, raw: s.slice(i + 1, close) });
			i = close + 1;
		} else if (q === '>') {
			attrs.push({ name, raw: '' });
		} else {
			let k = i;
			while (k < n && !isWs(s[k]) && s[k] !== '>') k++;
			attrs.push({ name, raw: s.slice(i, k) });
			i = k;
		}
	}
	return null;
}

/** Fin d'un commentaire commencé en `i` (`<!--`), règles `-->`, `--!>`, `<!-->`, `<!--->`. */
function commentEnd(s: string, i: number): number {
	const j = i + 4;
	if (s[j] === '>') return j + 1;
	if (s[j] === '-' && s[j + 1] === '>') return j + 2;
	const a = s.indexOf('-->', j);
	const b = s.indexOf('--!>', j);
	if (a < 0 && b < 0) return s.length;
	if (b < 0 || (a >= 0 && a < b)) return a + 3;
	return b + 4;
}

/** Position de la balise fermante « appropriée » `</name` (insensible à la casse). */
function findEndTag(s: string, from: number, name: string): number {
	const re = new RegExp(`</${name}[\\t\\n\\f\\r />]`, 'gi');
	re.lastIndex = from;
	const m = re.exec(s);
	return m ? m.index : s.length;
}

/** Consomme la balise fermante située en `at` ; fin du document si absente/inachevée. */
function skipEndTag(s: string, at: number, name: string): number {
	if (at >= s.length) return s.length;
	const rest = readTagRest(s, at + 2 + name.length);
	return rest ? rest.end : s.length;
}

/**
 * Sous-ensemble des références nommées HTML décodées dans les valeurs d'attributs
 * (toutes celles qui produisent de la ponctuation ASCII utile à un contournement).
 * Une référence inconnue fait échouer en mode fermé les valeurs interprétées en CSS ;
 * pour les URLs, la liste blanche suffit (une référence non décodée ne la passe pas).
 */
const NAMED_REFS: Record<string, string> = {
	amp: '&',
	AMP: '&',
	lt: '<',
	LT: '<',
	gt: '>',
	GT: '>',
	quot: '"',
	QUOT: '"',
	apos: "'",
	nbsp: '\u00a0',
	colon: ':',
	sol: '/',
	bsol: '\\',
	lpar: '(',
	rpar: ')',
	semi: ';',
	comma: ',',
	period: '.',
	num: '#',
	excl: '!',
	commat: '@',
	Tab: '\t',
	NewLine: '\n',
	percnt: '%',
	equals: '=',
	quest: '?',
	lowbar: '_',
	plus: '+',
	ast: '*',
	midast: '*',
	dollar: '$',
	grave: '`',
	lsqb: '[',
	rsqb: ']',
	lbrack: '[',
	rbrack: ']',
	lcub: '{',
	rcub: '}',
	lbrace: '{',
	rbrace: '}',
	vert: '|',
	verbar: '|',
	VerticalLine: '|',
	Hat: '^',
	copy: '©',
	reg: '®',
	eacute: 'é',
	egrave: 'è',
	ecirc: 'ê',
	agrave: 'à',
	ccedil: 'ç',
	laquo: '«',
	raquo: '»',
	lsquo: '‘',
	rsquo: '’',
	ldquo: '“',
	rdquo: '”',
	hellip: '…',
	ndash: '–',
	mdash: '—',
	middot: '·',
	euro: '€',
	deg: '°'
};
/** Références nommées historiques admises sans `;` (seules à produire de l'ASCII). */
const LEGACY_REFS = new Set(['amp', 'AMP', 'lt', 'LT', 'gt', 'GT', 'quot', 'QUOT', 'nbsp']);

function codePointToString(cp: number): string {
	if (cp === 0 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return '\ufffd';
	return String.fromCodePoint(cp);
}

/**
 * Décode les références de caractères d'une valeur d'attribut. `unknown` signale
 * une référence nommée (avec `;`) absente de la table : l'appelant échoue alors
 * en mode fermé quand la valeur est interprétée (CSS).
 */
function decodeEntities(raw: string): { value: string; unknown: boolean } {
	let unknown = false;
	const value = raw.replace(
		/&(?:#[xX]([0-9a-fA-F]+);?|#([0-9]+);?|([A-Za-z][A-Za-z0-9]*)(;?))/g,
		(
			match,
			hex: string | undefined,
			dec: string | undefined,
			name: string | undefined,
			semi: string,
			offset: number
		) => {
			if (hex !== undefined) return codePointToString(parseInt(hex, 16));
			if (dec !== undefined) return codePointToString(parseInt(dec, 10));
			if (name === undefined) return match;
			if (semi === ';') {
				if (Object.prototype.hasOwnProperty.call(NAMED_REFS, name)) return NAMED_REFS[name];
				unknown = true;
				return match;
			}
			// Sans `;` : décodé seulement si non suivi d'un alphanumérique ou de `=`.
			const next = raw[offset + match.length];
			if (LEGACY_REFS.has(name) && (next === undefined || !/[A-Za-z0-9=]/.test(next))) {
				return NAMED_REFS[name];
			}
			return match;
		}
	);
	return { value, unknown };
}

/** URL telle que le navigateur la lit : sans tab/CR/LF internes ni blancs/contrôles aux bords. */
function cleanUrl(value: string): string {
	return value.replace(/[\t\n\r]/g, '').replace(/^[\u0000- ]+|[\u0000- ]+$/g, '');
}

function serializeAttr(name: string, value: string): string {
	return ` ${name}="${escapeAttr(value)}"`;
}

/** Attribut de navigation (`href`, `xlink:href`, `*:href`) : jamais émis. */
function isLinkAttr(lname: string): boolean {
	return lname === 'href' || lname.endsWith(':href');
}

/** Valeur d'attribut décodée (références de caractères), chaîne vide si absente. */
function attrValue(attr: RawAttr | undefined): string {
	return attr && attr.raw !== null ? decodeEntities(attr.raw).value : '';
}

/** `style=""` assaini, ou `null` si la valeur est absente ou indécodable. */
function sanitizeStyleAttr(attr: RawAttr): string | null {
	if (attr.raw === null) return null;
	const decoded = decodeEntities(attr.raw);
	return decoded.unknown ? null : sanitizeCss(decoded.value);
}

/** Assainit un attribut ; renvoie sa sérialisation (` nom="valeur"`) ou `null` pour le retirer. */
function sanitizeAttr(tag: string, attr: RawAttr): string | null {
	const lname = attr.name.toLowerCase();
	if (lname.startsWith('on')) return null;
	if (DROP_ATTRS.has(lname)) return null;
	// Aucun lien navigable ; le marqueur d'aperçu n'est posé que par l'assainisseur.
	if (isLinkAttr(lname) || lname === PREVIEW_MARKER_ATTR) return null;
	if (lname === 'name' && FORM_FIELDS.has(tag)) return null;

	if (RESOURCE_ATTRS.has(lname)) {
		const url = cleanUrl(attrValue(attr));
		return DATA_IMAGE_URL.test(url) ? serializeAttr(attr.name, url) : null;
	}
	if (lname === 'style') {
		const css = sanitizeStyleAttr(attr);
		return css === null ? null : serializeAttr(attr.name, css);
	}

	if (attr.raw === null) return ` ${attr.name}`;
	const decoded = decodeEntities(attr.raw);
	// Attributs de présentation SVG (`fill="url(…)"`, `filter`, `mask`…) et assimilés.
	if (hasCssLoader(decoded.value, true)) {
		if (decoded.unknown) return null;
		return serializeAttr(attr.name, sanitizeCss(decoded.value));
	}
	return ` ${attr.name}="${escapeRawAttr(attr.raw)}"`;
}

/**
 * Marqueur d'aperçu d'un élément : `click` pour un `a`/`area` (HTML ou SVG) dont
 * un lien vaut la sentinelle de clic, `submit` pour un contrôle d'envoi.
 */
function previewMarker(tag: string, attrs: RawAttr[]): string | null {
	if (tag === 'a' || tag === 'area') {
		const click = attrs.some(
			(a) => isLinkAttr(a.name.toLowerCase()) && cleanUrl(attrValue(a)) === PREVIEW_SENTINELS.click
		);
		return click ? PREVIEW_MARKERS.click : null;
	}
	if (tag === 'button' || tag === 'input') {
		const type = attrs.find((a) => a.name.toLowerCase() === 'type');
		return isSubmitControl(tag, type ? attrValue(type) : null) ? PREVIEW_MARKERS.submit : null;
	}
	return null;
}

/** Affordance des éléments cliquables de l'aperçu (ils n'ont plus de href). */
const CLICK_CURSOR = 'cursor:pointer';

/** Reconstruit une balise ouvrante filtrée, ou `null` si le nom est invalide. */
function buildStartTag(
	rawName: string,
	tag: string,
	rawAttrs: RawAttr[],
	selfClosing: boolean
): string | null {
	if (!VALID_TAG.test(rawName)) return null;
	// Comme le navigateur : seule la première occurrence d'un attribut compte.
	const seen = new Set<string>();
	const attrs: RawAttr[] = [];
	for (const attr of rawAttrs) {
		const lname = attr.name.toLowerCase();
		if (seen.has(lname)) continue;
		seen.add(lname);
		if (VALID_ATTR.test(attr.name)) attrs.push(attr);
	}

	const marker = previewMarker(tag, attrs);
	let out = `<${rawName}`;
	let cursorSet = false;
	for (const attr of attrs) {
		const lname = attr.name.toLowerCase();
		// Clavier : l'assainisseur impose lui-même tabindex et role sur les liens d'aperçu.
		if (marker === PREVIEW_MARKERS.click && (lname === 'tabindex' || lname === 'role')) continue;
		if (marker === PREVIEW_MARKERS.click && lname === 'style') {
			// Préfixe (et non suffixe) : rien d'inachevé dans la valeur ne peut l'absorber.
			const css = sanitizeStyleAttr(attr);
			out += serializeAttr(attr.name, css ? `${CLICK_CURSOR};${css}` : CLICK_CURSOR);
			cursorSet = true;
			continue;
		}
		const serialized = sanitizeAttr(tag, attr);
		if (serialized !== null) out += serialized;
	}
	if (marker !== null) {
		out += serializeAttr(PREVIEW_MARKER_ATTR, marker);
		if (marker === PREVIEW_MARKERS.click)
			out += serializeAttr('tabindex', '0') + serializeAttr('role', 'link');
		if (marker === PREVIEW_MARKERS.click && !cursorSet) out += serializeAttr('style', CLICK_CURSOR);
	}
	if (tag === 'form') {
		// Toute soumission pointe vers la sentinelle, en GET (jamais de POST vers le
		// dashboard si l'iframe n'était pas sandboxée ; la CSP injectée l'interdit déjà).
		out += serializeAttr('action', PREVIEW_SENTINELS.submit) + serializeAttr('method', 'get');
	}
	return out + (selfClosing ? ' />' : '>');
}

/**
 * Assainit un document HTML pour l'aperçu : retire `<script>`, attributs `on*`,
 * `<meta http-equiv>`, `<base>`, `<link>`, `<iframe>`, `<object>`, `<embed>`,
 * commentaires (y compris conditionnels MSO) et tout attribut `href` ; marque les
 * liens de clic et les contrôles d'envoi (`data-rf-preview`) ; n'admet comme
 * ressource que les images `data:` raster, dans les attributs comme dans le CSS ;
 * retire les attributs `name` des champs ; force l'action des formulaires sur la
 * sentinelle de soumission ; injecte une CSP restrictive, premier élément du
 * `<head>` effectif.
 */
export function sanitizePreviewHtml(input: string): string {
	// Prétraitement du flux d'entrée HTML : CR et CRLF → LF, comme le navigateur
	// (sinon `&#10;` après un CR brut serait lu différemment par le CSS).
	const s = input.replace(/\r\n?/g, '\n');
	const n = s.length;
	const out: string[] = [];
	let significant = false;
	let cspInserted = false;
	// Vrai tant que seuls des blancs, le doctype et un premier `<html>` ont été
	// émis : un `<head>` explicite est alors le head effectif (sinon le navigateur
	// a déjà créé un head implicite, voire un body, et l'ignore).
	let headClean = true;
	let htmlIdx = -1;
	let doctypeIdx = -1;
	let i = 0;

	const pushText = (text: string) => {
		if (text === '') return;
		if (/[^\t\n\f\r ]/.test(text)) {
			significant = true;
			headClean = false;
		}
		out.push(escapeText(text));
	};

	while (i < n) {
		const lt = s.indexOf('<', i);
		if (lt < 0) {
			pushText(s.slice(i));
			break;
		}
		pushText(s.slice(i, lt));
		i = lt;
		const c1 = s[i + 1];

		if (isAlpha(c1)) {
			let j = i + 1;
			while (j < n && !isWs(s[j]) && s[j] !== '/' && s[j] !== '>') j++;
			const rawName = s.slice(i + 1, j);
			const tag = rawName.toLowerCase();
			const rest = readTagRest(s, j);
			if (!rest) break; // balise inachevée en fin de document : ignorée
			i = rest.end;
			significant = true;

			if (tag === 'plaintext') break; // tout le reste serait du texte brut : abandonné
			if (DROP_WITH_CONTENT.has(tag) || RCDATA.has(tag) || tag === 'style') {
				const close = findEndTag(s, i, tag);
				const content = s.slice(i, close);
				i = skipEndTag(s, close, tag);
				if (DROP_WITH_CONTENT.has(tag)) continue;
				const open = buildStartTag(rawName, tag, rest.attrs, false);
				if (open === null) continue;
				const body = tag === 'style' ? sanitizeStyleElement(content) : escapeText(content);
				out.push(`${open}${body}</${rawName}>`);
				headClean = false;
				continue;
			}
			if (DROP_TAG.has(tag)) continue;
			if (tag === 'meta' && rest.attrs.some((a) => a.name.toLowerCase() === 'http-equiv')) {
				continue;
			}
			const open = buildStartTag(rawName, tag, rest.attrs, rest.selfClosing);
			if (open === null) continue;
			out.push(open);
			if (headClean && tag === 'html' && htmlIdx < 0) {
				htmlIdx = out.length; // juste après `<html>` : mode « before head »
			} else if (headClean && tag === 'head' && !cspInserted) {
				out.push(CSP_META);
				cspInserted = true;
			} else {
				headClean = false;
			}
			continue;
		}

		if (c1 === '/') {
			const c2 = s[i + 2];
			if (isAlpha(c2)) {
				let j = i + 2;
				while (j < n && !isWs(s[j]) && s[j] !== '/' && s[j] !== '>') j++;
				const rawName = s.slice(i + 2, j);
				const tag = rawName.toLowerCase();
				const rest = readTagRest(s, j);
				if (!rest) break;
				i = rest.end;
				if (
					DROP_TAG.has(tag) ||
					DROP_WITH_CONTENT.has(tag) ||
					tag === 'plaintext' ||
					!VALID_TAG.test(rawName)
				) {
					continue;
				}
				out.push(`</${rawName}>`);
				headClean = false;
				continue;
			}
			if (c2 === '>') {
				i += 3; // `</>` : ignoré par le navigateur
				continue;
			}
			const gt = s.indexOf('>', i + 2); // commentaire « bogus »
			i = gt < 0 ? n : gt + 1;
			continue;
		}

		if (c1 === '!') {
			if (s.startsWith('<!--', i)) {
				i = commentEnd(s, i); // commentaires (dont conditionnels MSO) supprimés
				continue;
			}
			const gt = s.indexOf('>', i + 2);
			const decl = s.slice(i + 2, gt < 0 ? n : gt);
			i = gt < 0 ? n : gt + 1;
			if (/^doctype/i.test(decl) && !significant && doctypeIdx < 0) {
				out.push('<!DOCTYPE html>');
				doctypeIdx = out.length;
			}
			continue; // CDATA et autres déclarations : supprimés
		}

		if (c1 === '?') {
			const gt = s.indexOf('>', i + 2);
			i = gt < 0 ? n : gt + 1;
			continue;
		}

		out.push('&lt;');
		significant = true;
		headClean = false;
		i++;
	}

	if (!cspInserted) {
		// Pas de `<head>` effectif explicite : la meta est insérée là où le
		// navigateur est encore en mode « before html/head » (après le premier
		// `<html>` s'il n'est précédé que de blancs/doctype, sinon après le doctype,
		// sinon au tout début) ; il crée alors un head implicite dont elle est le
		// premier enfant (un `<head>` ultérieur est ignoré, les attributs d'un
		// `<html>` ultérieur sont fusionnés).
		const at = htmlIdx >= 0 ? htmlIdx : doctypeIdx >= 0 ? doctypeIdx : 0;
		out.splice(at, 0, CSP_META);
	}
	return out.join('');
}

// ---------------------------------------------------------------------------
// Assainissement CSS
//
// Passe 1 : tokenisation conforme à CSS Syntax Level 3 (§4.3) sur l'entrée
// prétraitée comme par le navigateur (CR, CRLF, FF → LF ; NUL et surrogats isolés
// → U+FFFD). Les jetons sont ré-émis tels quels, sauf : commentaires vidés
// (`/**/`), jetons `url(…)` et fonctions de chargement (nom comparé APRÈS décodage
// complet des échappements, préfixe vendeur compris) remplacés par `none` hors
// `url(#id)` et images `data:` raster, règles `@import` supprimées.
//
// Passe 2, échec fermé et indépendante du tokeniseur : tout segment (texte entre
// deux `;`, `{` ou `}`) qui contient encore une fonction de chargement ou
// `@import`, en lecture brute ou après décodage des échappements, avec ou sans
// commentaires, est supprimé ; si le résultat en contient encore, tout est vidé.
// ---------------------------------------------------------------------------

type CssTokenType =
	| 'ws'
	| 'comment'
	| 'string'
	| 'bad-string'
	| 'url'
	| 'bad-url'
	| 'function'
	| 'ident'
	| 'at-keyword'
	| 'hash'
	| 'numeric'
	| 'delim'
	| 'cdo'
	| 'cdc'
	| '('
	| ')'
	| '['
	| ']'
	| '{'
	| '}'
	| ';'
	| ':'
	| ',';

/** Jeton CSS : position dans la source et valeur décodée (nom, chaîne, URL, unité). */
type CssToken = { type: CssTokenType; start: number; end: number; value: string };

const SINGLE_CHAR_TOKENS = new Set(['(', ')', '[', ']', '{', '}', ';', ':', ',']);

function asciiLower(s: string): string {
	return s.replace(/[A-Z]/g, (c) => c.toLowerCase());
}

/** Prétraitement CSS Syntax §3.3. */
function preprocessCss(css: string): string {
	return css
		.replace(/\r\n?|\f/g, '\n')
		.replace(/\u0000|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '�');
}

function isHex(c: string | undefined): boolean {
	return c !== undefined && /^[0-9a-fA-F]$/.test(c);
}

function isDigit(c: string | undefined): boolean {
	return c !== undefined && c >= '0' && c <= '9';
}

function isCssWs(c: string | undefined): boolean {
	return c === ' ' || c === '\t' || c === '\n';
}

function isIdentStart(c: string | undefined): boolean {
	return c !== undefined && (/^[A-Za-z_]$/.test(c) || c.charCodeAt(0) >= 0x80);
}

function isIdentCode(c: string | undefined): boolean {
	return isIdentStart(c) || isDigit(c) || c === '-';
}

function isNonPrintable(c: string): boolean {
	const n = c.charCodeAt(0);
	return n <= 0x08 || n === 0x0b || (n >= 0x0e && n <= 0x1f) || n === 0x7f;
}

/** `\` suivi d'autre chose qu'un saut de ligne (la fin de fichier compte). */
function isValidEscape(s: string, i: number): boolean {
	return s[i] === '\\' && s[i + 1] !== '\n';
}

function wouldStartIdent(s: string, i: number): boolean {
	const c = s[i];
	if (c === '-') return isIdentStart(s[i + 1]) || s[i + 1] === '-' || isValidEscape(s, i + 1);
	if (c === '\\') return isValidEscape(s, i);
	return isIdentStart(c);
}

function wouldStartNumber(s: string, i: number): boolean {
	const c = s[i];
	if (c === '+' || c === '-') {
		return isDigit(s[i + 1]) || (s[i + 1] === '.' && isDigit(s[i + 2]));
	}
	if (c === '.') return isDigit(s[i + 1]);
	return isDigit(c);
}

/** Échappement valide commençant en `i` (`\`) : 1 à 6 chiffres hexa et un blanc, ou un caractère. */
function consumeCssEscape(s: string, i: number): { char: string; end: number } {
	const j = i + 1;
	if (j >= s.length) return { char: '�', end: j };
	if (isHex(s[j])) {
		let k = j;
		while (k < s.length && k < j + 6 && isHex(s[k])) k++;
		const char = codePointToString(parseInt(s.slice(j, k), 16));
		if (isCssWs(s[k])) k++;
		return { char, end: k };
	}
	const char = String.fromCodePoint(s.codePointAt(j) as number);
	return { char, end: j + char.length };
}

function consumeIdentSequence(s: string, i: number): { value: string; end: number } {
	let value = '';
	let j = i;
	while (j < s.length) {
		if (isIdentCode(s[j])) {
			value += s[j];
			j++;
		} else if (isValidEscape(s, j)) {
			const esc = consumeCssEscape(s, j);
			value += esc.char;
			j = esc.end;
		} else {
			break;
		}
	}
	return { value, end: j };
}

function consumeCssString(s: string, i: number): CssToken {
	const quote = s[i];
	let value = '';
	let j = i + 1;
	while (j < s.length) {
		const c = s[j];
		if (c === quote) return { type: 'string', start: i, end: j + 1, value };
		// Saut de ligne non échappé : chaîne invalide, le saut de ligne n'est pas consommé.
		if (c === '\n') return { type: 'bad-string', start: i, end: j, value };
		if (c === '\\') {
			if (j + 1 >= s.length) j++;
			else if (s[j + 1] === '\n')
				j += 2; // continuation de ligne
			else {
				const esc = consumeCssEscape(s, j);
				value += esc.char;
				j = esc.end;
			}
			continue;
		}
		value += c;
		j++;
	}
	return { type: 'string', start: i, end: s.length, value };
}

function consumeBadUrlRemnants(s: string, i: number): number {
	let j = i;
	while (j < s.length) {
		if (s[j] === ')') return j + 1;
		if (isValidEscape(s, j)) j = consumeCssEscape(s, j).end;
		else j++;
	}
	return s.length;
}

/** Jeton `url(…)` non cité ; `i` suit la parenthèse ouvrante. */
function consumeUrlToken(s: string, start: number, i: number): CssToken {
	let j = i;
	while (isCssWs(s[j])) j++;
	let value = '';
	const bad = (from: number): CssToken => ({
		type: 'bad-url',
		start,
		end: consumeBadUrlRemnants(s, from),
		value
	});
	while (j < s.length) {
		const c = s[j];
		if (c === ')') return { type: 'url', start, end: j + 1, value };
		if (isCssWs(c)) {
			while (isCssWs(s[j])) j++;
			if (j >= s.length) return { type: 'url', start, end: j, value };
			if (s[j] === ')') return { type: 'url', start, end: j + 1, value };
			return bad(j);
		}
		if (c === '"' || c === "'" || c === '(' || isNonPrintable(c)) return bad(j + 1);
		if (c === '\\') {
			if (!isValidEscape(s, j)) return bad(j + 1);
			const esc = consumeCssEscape(s, j);
			value += esc.char;
			j = esc.end;
			continue;
		}
		value += c;
		j++;
	}
	return { type: 'url', start, end: s.length, value };
}

function consumeIdentLike(s: string, i: number): CssToken {
	const { value, end } = consumeIdentSequence(s, i);
	let j = end;
	if (asciiLower(value) === 'url' && s[j] === '(') {
		j++;
		while (isCssWs(s[j]) && isCssWs(s[j + 1])) j++;
		const c = s[j];
		if (c === '"' || c === "'" || (isCssWs(c) && (s[j + 1] === '"' || s[j + 1] === "'"))) {
			return { type: 'function', start: i, end: j, value };
		}
		return consumeUrlToken(s, i, j);
	}
	if (s[j] === '(') return { type: 'function', start: i, end: j + 1, value };
	return { type: 'ident', start: i, end: j, value };
}

function consumeNumeric(s: string, i: number): CssToken {
	let j = i;
	if (s[j] === '+' || s[j] === '-') j++;
	while (isDigit(s[j])) j++;
	if (s[j] === '.' && isDigit(s[j + 1])) {
		j += 2;
		while (isDigit(s[j])) j++;
	}
	if (
		(s[j] === 'e' || s[j] === 'E') &&
		(isDigit(s[j + 1]) || ((s[j + 1] === '+' || s[j + 1] === '-') && isDigit(s[j + 2])))
	) {
		j += isDigit(s[j + 1]) ? 2 : 3;
		while (isDigit(s[j])) j++;
	}
	if (wouldStartIdent(s, j)) {
		const unit = consumeIdentSequence(s, j);
		return { type: 'numeric', start: i, end: unit.end, value: unit.value };
	}
	if (s[j] === '%') j++;
	return { type: 'numeric', start: i, end: j, value: '' };
}

/** Tokeniseur CSS Syntax Level 3 (§4.3) ; les commentaires sont conservés comme jetons. */
function tokenizeCss(s: string): CssToken[] {
	const tokens: CssToken[] = [];
	let i = 0;
	const push = (t: CssToken) => {
		tokens.push(t);
		i = t.end;
	};
	const simple = (type: CssTokenType, end: number, value = '') =>
		push({ type, start: i, end, value });
	while (i < s.length) {
		const c = s[i];
		if (c === '/' && s[i + 1] === '*') {
			const close = s.indexOf('*/', i + 2);
			simple('comment', close < 0 ? s.length : close + 2);
		} else if (isCssWs(c)) {
			let j = i + 1;
			while (isCssWs(s[j])) j++;
			simple('ws', j);
		} else if (c === '"' || c === "'") {
			push(consumeCssString(s, i));
		} else if (c === '#') {
			if (isIdentCode(s[i + 1]) || isValidEscape(s, i + 1)) {
				const id = consumeIdentSequence(s, i + 1);
				simple('hash', id.end, id.value);
			} else simple('delim', i + 1);
		} else if (SINGLE_CHAR_TOKENS.has(c)) {
			simple(c as CssTokenType, i + 1);
		} else if (c === '+' || c === '.') {
			if (wouldStartNumber(s, i)) push(consumeNumeric(s, i));
			else simple('delim', i + 1);
		} else if (c === '-') {
			if (wouldStartNumber(s, i)) push(consumeNumeric(s, i));
			else if (s[i + 1] === '-' && s[i + 2] === '>') simple('cdc', i + 3);
			else if (wouldStartIdent(s, i)) push(consumeIdentLike(s, i));
			else simple('delim', i + 1);
		} else if (c === '<') {
			if (s.startsWith('!--', i + 1)) simple('cdo', i + 4);
			else simple('delim', i + 1);
		} else if (c === '@') {
			if (wouldStartIdent(s, i + 1)) {
				const id = consumeIdentSequence(s, i + 1);
				simple('at-keyword', id.end, id.value);
			} else simple('delim', i + 1);
		} else if (c === '\\') {
			if (isValidEscape(s, i)) push(consumeIdentLike(s, i));
			else simple('delim', i + 1);
		} else if (isDigit(c)) {
			push(consumeNumeric(s, i));
		} else if (isIdentStart(c)) {
			push(consumeIdentLike(s, i));
		} else {
			simple('delim', i + 1);
		}
	}
	return tokens;
}

/** Nom de fonction (décodé, minuscules) capable de charger une ressource, préfixe vendeur compris. */
const CSS_LOADER_NAME = /(?:^|-)(?:url|image-set|image|cross-fade|src|element|expression)$/;

/** Cible admise d'un `url()` : référence interne `#id` ou image raster `data:` en base64. */
function isAllowedUrlTarget(value: string): boolean {
	return FRAGMENT_URL.test(value) || DATA_IMAGE_URL.test(value);
}

/** Indice du jeton qui ferme le bloc ouvert en `k` (`(`, fonction, `[`, `{`) ; à défaut, le dernier. */
function blockEnd(tokens: CssToken[], k: number): number {
	const stack: string[] = [];
	for (let j = k; j < tokens.length; j++) {
		const t = tokens[j].type;
		if (t === '(' || t === 'function') stack.push(')');
		else if (t === '[') stack.push(']');
		else if (t === '{') stack.push('}');
		else if (t === stack[stack.length - 1]) {
			stack.pop();
			if (stack.length === 0) return j;
		}
	}
	return tokens.length - 1;
}

/** Dernier jeton de la règle `@…` commençant en `k` : `;` ou bloc `{}` inclus, `}` orphelin exclu. */
function atRuleEnd(tokens: CssToken[], k: number): number {
	for (let j = k + 1; j < tokens.length; j++) {
		const t = tokens[j].type;
		if (t === ';') return j;
		if (t === '}') return j - 1;
		if (t === '{' || t === '(' || t === '[' || t === 'function') {
			const end = blockEnd(tokens, j);
			if (t === '{') return end;
			j = end;
		}
	}
	return tokens.length - 1;
}

/** `url(` suivi d'une seule chaîne admise puis `)` : renvoie la chaîne, sinon `null`. */
function allowedQuotedUrl(tokens: CssToken[], k: number, end: number): CssToken | null {
	if (end <= k || tokens[end].type !== ')') return null;
	let arg: CssToken | null = null;
	for (let j = k + 1; j < end; j++) {
		const t = tokens[j];
		if (t.type === 'ws') continue;
		if (t.type !== 'string' || arg) return null;
		arg = t;
	}
	return arg && isAllowedUrlTarget(arg.value) ? arg : null;
}

/** Passe 1 : ré-émission des jetons, chargements neutralisés. */
function rewriteCss(s: string): string {
	const tokens = tokenizeCss(s);
	let out = '';
	for (let k = 0; k < tokens.length; k++) {
		const t = tokens[k];
		const source = s.slice(t.start, t.end);
		if (t.type === 'comment') {
			out += '/**/';
		} else if (t.type === 'url' || t.type === 'bad-url') {
			const ok = t.type === 'url' && isAllowedUrlTarget(t.value);
			// Forme canonique si la source contient des échappements.
			out += !ok ? 'none' : source.includes('\\') ? `url(${t.value})` : source;
		} else if (t.type === 'function' && CSS_LOADER_NAME.test(asciiLower(t.value))) {
			const end = blockEnd(tokens, k);
			const arg = asciiLower(t.value) === 'url' ? allowedQuotedUrl(tokens, k, end) : null;
			const whole = s.slice(t.start, tokens[end].end);
			out += !arg ? 'none' : whole.includes('\\') ? `url("${arg.value}")` : whole;
			k = end;
		} else if (t.type === 'at-keyword' && asciiLower(t.value) === 'import') {
			k = atRuleEnd(tokens, k);
			// Séparateur si les jetons voisins pouvaient se souder (`u@import…;rl(`).
			if (out !== '' && !/[\s;{}]$/.test(out)) out += '/**/';
		} else {
			out += source;
		}
	}
	return out;
}

/**
 * Appel d'une fonction de chargement et `@import`, sans exigence de frontière à
 * gauche (`-webkit-image-set(`, `xurl(`… comptent). En contexte CSS, des blancs
 * sont tolérés avant `(` (plus strict que le tokeniseur) ; pour sonder un
 * attribut texte, seule la syntaxe exacte d'un jeton fonction compte.
 */
const CSS_LOADER_CALL_LOOSE =
	/(?:url|image-set|image|cross-fade|src|element|expression)\s*\(|@import/g;
const CSS_LOADER_CALL_EXACT =
	/(?:url|image-set|image|cross-fade|src|element|expression)\(|@import/g;
/** `url(…)` admis, ancré (`y`) sur la position d'une correspondance ci-dessus. */
const CSS_ALLOWED_URL_CALL =
	/url\s*\(\s*(["']?)(?:#[a-z0-9_.:-]*|data:image\/(?:png|gif|jpe?g|webp|avif|bmp);base64,[a-z0-9+/]+={0,2})\1\s*\)/y;

function hasLoaderCall(text: string, pattern: RegExp): boolean {
	const t = asciiLower(text);
	for (const m of t.matchAll(pattern)) {
		if (m[0].startsWith('url')) {
			CSS_ALLOWED_URL_CALL.lastIndex = m.index ?? 0;
			if (CSS_ALLOWED_URL_CALL.test(t)) continue;
		}
		return true;
	}
	return false;
}

/** Décode tous les échappements CSS, sans tenir compte du contexte. */
function decodeCssEscapes(s: string): string {
	return s.replace(
		/\\(?:([0-9a-fA-F]{1,6})[ \t\n]?|(\n)|([\s\S]?))/g,
		(_m, hex: string | undefined, nl: string | undefined, other: string | undefined) => {
			if (hex !== undefined) return codePointToString(parseInt(hex, 16));
			if (nl !== undefined) return '';
			return other || '�';
		}
	);
}

function stripCssComments(s: string): string {
	return s.replace(/\/\*[\s\S]*?(?:\*\/|$)/g, '');
}

/**
 * Sonde d'échec fermé : le texte contient-il une fonction de chargement (hors
 * `url(#id)` et image `data:` raster) ou `@import`, sous l'une des quatre lectures
 * brute/décodée × avec/sans commentaires ? `exact` : sonde d'un attribut texte
 * (pas de blanc toléré avant `(`).
 */
function hasCssLoader(css: string, exact = false): boolean {
	const s = preprocessCss(css);
	const bare = stripCssComments(s);
	const pattern = exact ? CSS_LOADER_CALL_EXACT : CSS_LOADER_CALL_LOOSE;
	return [s, decodeCssEscapes(s), bare, decodeCssEscapes(bare)].some((v) =>
		hasLoaderCall(v, pattern)
	);
}

/** Passe 2 : supprime les segments (entre `;`, `{`, `}`) encore suspects ; vide tout en dernier recours. */
function failClosed(css: string): string {
	if (!hasCssLoader(css)) return css;
	let out = '';
	let from = 0;
	const keep = (segment: string) => (hasCssLoader(segment) ? '' : segment);
	for (const t of tokenizeCss(css)) {
		if (t.type !== ';' && t.type !== '{' && t.type !== '}') continue;
		out += keep(css.slice(from, t.start)) + css.slice(t.start, t.end);
		from = t.end;
	}
	out += keep(css.slice(from));
	return hasCssLoader(out) ? '' : out;
}

/**
 * Neutralise tout chargement d'URL d'une feuille de style ou d'une déclaration :
 * règles `@import` supprimées ; `url()`, `image-set()`, `image()`, `cross-fade()`,
 * `element()`, `src()`, `expression()` (préfixes vendeurs compris, noms décodés)
 * remplacés par `none`, sauf `url(#id)` et images `data:` raster ; commentaires
 * vidés. Puis échec fermé : toute déclaration (ou prélude de règle) où subsiste
 * une fonction de chargement, même dans une chaîne, est supprimée.
 */
export function sanitizeCss(css: string): string {
	return failClosed(rewriteCss(preprocessCss(css)));
}

/**
 * Contenu d'un `<style>` : CSS assaini, puis `<` et `&` (début de référence)
 * échappés en CSS. Le texte est ainsi identique qu'il soit lu en texte brut (HTML)
 * ou en balisage (dans `<svg>`/`<math>`) : aucune sortie possible de l'élément.
 */
function sanitizeStyleElement(css: string): string {
	return sanitizeCss(css)
		.replace(/</g, '\\3c ')
		.replace(/&(?=[#A-Za-z])/g, '\\26 ');
}

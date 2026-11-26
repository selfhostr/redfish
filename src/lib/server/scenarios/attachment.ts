import type { Scenario } from '$lib/server/db/schema';
import { escapeHtml, loadScenarioContent, substitute } from './render';
import type { RenderCtx, ScenarioContent } from './render';

/**
 * Pièce jointe rendue, au format attendu par nodemailer
 * (`transport.sendMail({ attachments: [...] })`). `content` est une chaîne HTML
 * (mode `html`) ou un Buffer PDF (mode `pdf`).
 *
 * INVARIANT « ZÉRO CAPTURE » : aucune variante ne collecte la moindre saisie.
 * La PJ HTML ne contient qu'un beacon d'ouverture (comme le pixel `/t/o`) ; la
 * PJ PDF ne contient qu'un lien cliquable vers l'URL de clic existante.
 */
export type RenderedAttachment = {
	filename: string;
	content: string | Buffer;
	contentType: string;
};

const DEFAULT_HTML_FILENAME = 'document.html';
const DEFAULT_PDF_FILENAME = 'document.pdf';

/** Contenu minimal d'un scénario nécessaire au rendu de la PJ. */
type AttachmentContent = Pick<
	ScenarioContent,
	'attachmentMode' | 'attachmentFilename' | 'attachmentTemplate'
>;

/**
 * Rend la pièce jointe d'un contenu en mémoire, ou `null` quand
 * `attachmentMode === 'none'`.
 *
 * - `html` : interpole le gabarit (`{{firstName}}` échappé, `{{attachmentOpen}}`
 *   brute) ; le gabarit porte lui-même le beacon
 *   `<img src="{{attachmentOpen}}" …>` (vérifié à l'import, cf. `validateAttachment`).
 * - `pdf` : produit un Buffer PDF (pdf-lib) contenant le texte visible du gabarit
 *   et une annotation lien cliquable vers l'URL de clic (`ctx.urls.click`).
 */
export async function renderAttachmentContent(
	content: AttachmentContent,
	ctx: RenderCtx
): Promise<RenderedAttachment | null> {
	if (content.attachmentMode === 'none') return null;
	const template = content.attachmentTemplate ?? '';

	if (content.attachmentMode === 'html') {
		const html = substitute(template, {
			firstName: escapeHtml(ctx.firstName),
			attachmentOpen: ctx.urls.attachmentOpen
		});
		return {
			filename: content.attachmentFilename?.trim() || DEFAULT_HTML_FILENAME,
			content: html,
			contentType: 'text/html; charset=utf-8'
		};
	}

	// pdf
	const text = substitute(template, {
		firstName: ctx.firstName,
		lastName: ctx.lastName,
		email: ctx.email
	});
	return {
		filename: content.attachmentFilename?.trim() || DEFAULT_PDF_FILENAME,
		content: await renderPdf(text, ctx.urls.click),
		contentType: 'application/pdf'
	};
}

/** Rend la pièce jointe d'un scénario persisté (voir {@link renderAttachmentContent}). */
export async function renderAttachment(
	scenario: Scenario,
	ctx: RenderCtx
): Promise<RenderedAttachment | null> {
	return renderAttachmentContent(await loadScenarioContent(scenario), ctx);
}

/** Restreint le texte au répertoire WinAnsi (ASCII + Latin-1), sans échec d'encodage. */
function toWinAnsi(text: string): string {
	return text.replace(/\r\n?/g, '\n').replace(/[^\n\x20-\x7E\u00a0-\u00ff]/g, '?');
}

/** Libellé du lien cliquable affiché dans le PDF. */
const PDF_LINK_LABEL = 'Ouvrir le document';

/**
 * Génère un PDF autosuffisant (pdf-lib, pur JS) : le texte visible du gabarit
 * puis un lien cliquable (annotation `Link` → action `URI`) pointant vers
 * `clickUrl`. Aucune saisie n'est collectée : seul le CLIC sur le lien est
 * mesuré, via l'URL de clic existante (événement `clicked`).
 */
async function renderPdf(text: string, clickUrl: string): Promise<Buffer> {
	const { PDFDocument, StandardFonts, PDFName, PDFString, rgb } = await import('pdf-lib');

	const doc = await PDFDocument.create();
	const font = await doc.embedFont(StandardFonts.Helvetica);
	const bold = await doc.embedFont(StandardFonts.HelveticaBold);

	const PAGE_W = 595.28;
	const PAGE_H = 841.89;
	const MARGIN = 56;
	const SIZE = 12;
	const LINE_H = 17;
	const maxWidth = PAGE_W - 2 * MARGIN;

	// Découpe le texte en lignes qui tiennent dans la largeur utile.
	const lines: string[] = [];
	for (const paragraph of toWinAnsi(text).split('\n')) {
		if (paragraph === '') {
			lines.push('');
			continue;
		}
		let current = '';
		for (const word of paragraph.split(/\s+/)) {
			const candidate = current ? `${current} ${word}` : word;
			if (font.widthOfTextAtSize(candidate, SIZE) > maxWidth && current) {
				lines.push(current);
				current = word;
			} else {
				current = candidate;
			}
		}
		lines.push(current);
	}

	let page = doc.addPage([PAGE_W, PAGE_H]);
	let y = PAGE_H - MARGIN;
	const newLineOrPage = () => {
		y -= LINE_H;
		if (y < MARGIN + LINE_H * 3) {
			page = doc.addPage([PAGE_W, PAGE_H]);
			y = PAGE_H - MARGIN;
		}
	};

	for (const line of lines) {
		if (line) page.drawText(line, { x: MARGIN, y, size: SIZE, font });
		newLineOrPage();
	}

	// Lien cliquable : texte bleu souligné + annotation Link → URI.
	y -= LINE_H;
	const linkSize = 13;
	const linkWidth = bold.widthOfTextAtSize(PDF_LINK_LABEL, linkSize);
	page.drawText(PDF_LINK_LABEL, {
		x: MARGIN,
		y,
		size: linkSize,
		font: bold,
		color: rgb(0.05, 0.3, 0.75)
	});
	const annotation = doc.context.obj({
		Type: 'Annot',
		Subtype: 'Link',
		Rect: [MARGIN - 2, y - 3, MARGIN + linkWidth + 2, y + linkSize + 2],
		Border: [0, 0, 0],
		A: doc.context.obj({ Type: 'Action', S: 'URI', URI: PDFString.of(clickUrl) })
	});
	const ref = doc.context.register(annotation);
	page.node.set(PDFName.of('Annots'), doc.context.obj([ref]));

	// `useObjectStreams: false` : l'URI du lien reste en clair dans les octets
	// (pas d'objet compressé), ce qui facilite l'audit du fichier produit.
	const bytes = await doc.save({ useObjectStreams: false });
	return Buffer.from(bytes);
}

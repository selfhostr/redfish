import { expect, test } from 'vitest';
import { renderAttachmentContent } from './attachment';
import type { RenderCtx } from './render';

const ctx: RenderCtx = {
	firstName: 'A<&>B',
	lastName: 'Durand',
	email: 'a.durand@exemple.test',
	urls: {
		open: 'https://track.exemple.test/t/o/TKN',
		click: 'https://track.exemple.test/t/c/TKN',
		submit: 'https://track.exemple.test/t/s/TKN',
		beacon: 'https://track.exemple.test/t/b/TKN',
		awareness: 'https://track.exemple.test/t/a/TKN',
		report: 'https://track.exemple.test/t/r/TKN',
		attachmentOpen: 'https://track.exemple.test/t/ao/TKN'
	}
};

const HTML_TEMPLATE =
	'<!doctype html><html lang="fr"><body><h1>Bonjour {{firstName}}</h1>' +
	'<img src="{{attachmentOpen}}" width="1" height="1" alt="" /></body></html>';

test('mode none : aucune pièce jointe', async () => {
	const out = await renderAttachmentContent(
		{ attachmentMode: 'none', attachmentFilename: null, attachmentTemplate: null },
		ctx
	);
	expect(out).toBeNull();
});

test('mode html : contient le beacon attachmentOpen, firstName échappé, aucun champ de capture', async () => {
	const out = await renderAttachmentContent(
		{
			attachmentMode: 'html',
			attachmentFilename: 'facture.html',
			attachmentTemplate: HTML_TEMPLATE
		},
		ctx
	);
	expect(out).not.toBeNull();
	expect(out!.filename).toBe('facture.html');
	expect(out!.contentType).toContain('text/html');
	const html = out!.content as string;
	// Le beacon d'ouverture pointe vers l'URL de suivi, interpolée brute.
	expect(html).toContain(ctx.urls.attachmentOpen);
	// firstName échappé en HTML (jamais injecté tel quel).
	expect(html).toContain('A&lt;&amp;&gt;B');
	expect(html).not.toContain('{{');
	// Invariant « zéro capture » : aucun champ de formulaire.
	expect(/<(?:form|input|select|textarea)\b/i.test(html)).toBe(false);
});

test('mode pdf : Buffer PDF non vide contenant un lien vers l’URL de clic', async () => {
	const out = await renderAttachmentContent(
		{
			attachmentMode: 'pdf',
			attachmentFilename: 'document.pdf',
			attachmentTemplate: 'Bonjour {{firstName}}, consultez le document ci-joint.'
		},
		ctx
	);
	expect(out).not.toBeNull();
	expect(out!.filename).toBe('document.pdf');
	expect(out!.contentType).toBe('application/pdf');
	const buf = out!.content as Buffer;
	expect(Buffer.isBuffer(buf)).toBe(true);
	expect(buf.byteLength).toBeGreaterThan(0);
	// En-tête PDF.
	expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
	// L'URL de clic figure en clair dans le fichier (annotation lien, non compressée).
	expect(buf.toString('latin1')).toContain(ctx.urls.click);
	// Aucune URL de beacon d'ouverture : le PDF ne mesure QUE le clic.
	expect(buf.toString('latin1')).not.toContain(ctx.urls.attachmentOpen);
});

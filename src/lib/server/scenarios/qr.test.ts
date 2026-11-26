import { expect, test } from 'vitest';
import { QR_CID, QR_IMG_HTML, renderQrPng } from './qr';

/** Signature d'un fichier PNG (8 premiers octets). */
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

test('renderQrPng produit un buffer PNG non vide', async () => {
	const buf = await renderQrPng('https://track.exemple.test/t/c/TKN');
	expect(Buffer.isBuffer(buf)).toBe(true);
	expect(buf.length).toBeGreaterThan(0);
	expect(buf.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
});

test('renderQrPng encode l’URL : URLs distinctes → PNG distincts, même URL → identique', async () => {
	const a = await renderQrPng('https://track.exemple.test/t/c/AAA');
	const b = await renderQrPng('https://track.exemple.test/t/c/BBB');
	const aAgain = await renderQrPng('https://track.exemple.test/t/c/AAA');
	// Le contenu du PNG dépend de l'URL encodée (QUE l'URL de clic).
	expect(a.equals(b)).toBe(false);
	// Déterministe : la même URL produit toujours le même PNG.
	expect(a.equals(aAgain)).toBe(true);
});

test('QR_IMG_HTML est une image inline référençant le cid de la pièce jointe', () => {
	expect(QR_CID).toBe('qr-redfish');
	expect(QR_IMG_HTML).toContain(`src="cid:${QR_CID}"`);
});

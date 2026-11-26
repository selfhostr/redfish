import QRCode from 'qrcode';

/**
 * QR code dans l'e-mail (« quishing »). Certains e-mails de phishing réels font
 * scanner un QR code plutôt que cliquer un lien : le QR encode ici l'URL de clic
 * de tracking EXISTANTE (`ctx.urls.click`), de sorte que scanner le QR revient à
 * cliquer — enregistré comme `clicked` par la route `/t/c/[token]` existante.
 * Aucun nouvel événement, aucune nouvelle route : seul l'affichage change.
 *
 * Intégration la plus compatible avec les webmails (Outlook/Gmail strippent
 * souvent les images `data:` et le SVG inline) : une pièce jointe inline PNG
 * référencée par Content-ID (`cid`). Le gabarit e-mail reçoit à la place de
 * `{{qrCode}}` un `<img src="cid:qr-redfish" …>` pointant vers cette PJ.
 *
 * Génération PNG : la librairie mature `qrcode` (`toBuffer`, type PNG). `uqr`,
 * déjà présent, ne produit que du SVG/texte — il faudrait un rasteriseur
 * supplémentaire (sharp n'est qu'une devDependency et absente en production) ;
 * `qrcode` rend directement un Buffer PNG, sans dépendance native.
 */

/** Content-ID de la pièce jointe inline du QR (référencé par `<img src="cid:…">`). */
export const QR_CID = 'qr-redfish';

/** Nom de fichier de la pièce jointe inline du QR. */
export const QR_FILENAME = 'qr-redfish.png';

/** Type MIME de la pièce jointe inline du QR. */
export const QR_CONTENT_TYPE = 'image/png';

/**
 * Markup inséré à la place de `{{qrCode}}` dans l'e-mail quand `include_qr` est
 * actif : une image référençant la pièce jointe inline par son Content-ID.
 */
export const QR_IMG_HTML = `<img src="cid:${QR_CID}" width="180" height="180" alt="QR" />`;

/**
 * Génère le PNG d'un QR code encodant `url`. L'appelant ne doit y passer QUE
 * l'URL de clic de tracking (`ctx.urls.click`), rien d'autre. Rendu déterministe
 * (pas de métadonnée horodatée) : une même URL produit toujours le même PNG.
 */
export async function renderQrPng(url: string): Promise<Buffer> {
	return QRCode.toBuffer(url, { type: 'png' });
}

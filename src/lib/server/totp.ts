import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { encode } from 'uqr';

/**
 * TOTP (RFC 6238) implémenté sur `node:crypto` : HMAC-SHA1, 6 chiffres, pas de
 * 30 s, compatible avec toutes les applications d'authentification courantes.
 * Aucune dépendance tierce pour la partie cryptographique.
 */

export const TOTP_DIGITS = 6;
export const TOTP_PERIOD_S = 30;
/** Tolérance de dérive d'horloge : ±1 pas (soit ±30 s). */
export const TOTP_WINDOW = 1;

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf: Buffer): string {
	let bits = 0;
	let value = 0;
	let out = '';
	for (const byte of buf) {
		value = (value << 8) | byte;
		bits += 8;
		while (bits >= 5) {
			out += B32[(value >>> (bits - 5)) & 31];
			bits -= 5;
		}
	}
	if (bits > 0) out += B32[(value << (5 - bits)) & 31];
	return out;
}

export function base32Decode(input: string): Buffer {
	const clean = input.toUpperCase().replace(/[\s=-]/g, '');
	let bits = 0;
	let value = 0;
	const out: number[] = [];
	for (const ch of clean) {
		const idx = B32.indexOf(ch);
		if (idx < 0) throw new Error('Base32 invalide');
		value = (value << 5) | idx;
		bits += 5;
		if (bits >= 8) {
			out.push((value >>> (bits - 8)) & 0xff);
			bits -= 8;
		}
	}
	return Buffer.from(out);
}

/** Secret aléatoire de 160 bits (taille recommandée par la RFC 4226), en base32. */
export function generateTotpSecret(): string {
	return base32Encode(randomBytes(20));
}

/** HOTP (RFC 4226) pour un compteur donné. */
export function hotp(secret: Buffer, counter: number, digits = TOTP_DIGITS): string {
	const msg = Buffer.alloc(8);
	msg.writeBigUInt64BE(BigInt(counter));
	const mac = createHmac('sha1', secret).update(msg).digest();
	const offset = mac[mac.length - 1] & 0x0f;
	const bin = mac.readUInt32BE(offset) & 0x7fffffff;
	return String(bin % 10 ** digits).padStart(digits, '0');
}

export function totpStep(now: number = Date.now()): number {
	return Math.floor(now / 1000 / TOTP_PERIOD_S);
}

export function generateTotp(secretB32: string, now: number = Date.now()): string {
	return hotp(base32Decode(secretB32), totpStep(now));
}

/**
 * Vérifie un code dans la fenêtre ±`TOTP_WINDOW`. Renvoie le pas accepté (à
 * mémoriser pour interdire le rejeu) ou `null`. Un pas ≤ `lastStep` est refusé.
 * La comparaison est à temps constant.
 */
export function verifyTotp(
	secretB32: string,
	code: string,
	opts: { now?: number; lastStep?: number | null } = {}
): number | null {
	const normalized = code.replace(/\s/g, '');
	if (!/^\d{6}$/.test(normalized)) return null;
	const secret = base32Decode(secretB32);
	const current = totpStep(opts.now ?? Date.now());
	const given = Buffer.from(normalized);
	let match: number | null = null;
	for (let d = -TOTP_WINDOW; d <= TOTP_WINDOW; d++) {
		const step = current + d;
		if (step < 0) continue;
		const expected = Buffer.from(hotp(secret, step));
		// Pas de court-circuit : on parcourt toute la fenêtre.
		if (timingSafeEqual(expected, given) && match === null) match = step;
	}
	if (match === null) return null;
	if (opts.lastStep != null && match <= opts.lastStep) return null;
	return match;
}

/** URI `otpauth://` standard (Key Uri Format) à encoder dans le QR code. */
export function otpauthUri(secretB32: string, account: string, issuer = 'redfish'): string {
	const label = encodeURIComponent(`${issuer}:${account}`);
	const params = new URLSearchParams({
		secret: secretB32,
		issuer,
		algorithm: 'SHA1',
		digits: String(TOTP_DIGITS),
		period: String(TOTP_PERIOD_S)
	});
	return `otpauth://totp/${label}?${params.toString()}`;
}

/**
 * QR code rendu côté serveur en SVG, servi comme URI `data:` : compatible avec
 * la CSP (`img-src 'self' data:`), aucun script ni ressource externe.
 */
export function qrDataUri(text: string): string {
	const { data, size } = encode(text, { ecc: 'M', border: 2 });
	let path = '';
	for (let y = 0; y < size; y++) {
		for (let x = 0; x < size; x++) {
			if (data[y][x]) path += `M${x} ${y}h1v1h-1z`;
		}
	}
	const svg =
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges">` +
		`<rect width="${size}" height="${size}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
	return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

/* ---------- Codes de secours ---------- */

export const RECOVERY_CODE_COUNT = 8;

/**
 * Code de secours : 80 bits aléatoires (16 caractères base32, groupés par 4).
 * Avec une telle entropie, un SHA-256 simple suffit pour le stockage (pas de
 * recherche exhaustive hors ligne réaliste, contrairement à un mot de passe).
 */
export function generateRecoveryCode(): string {
	const raw = base32Encode(randomBytes(10));
	return raw.match(/.{4}/g)!.join('-');
}

export function normalizeRecoveryCode(code: string): string {
	return code.toUpperCase().replace(/[\s-]/g, '');
}

export function hashRecoveryCode(code: string): string {
	return createHash('sha256').update(normalizeRecoveryCode(code)).digest('hex');
}

import { expect, test } from 'vitest';
import {
	TOTP_PERIOD_S,
	base32Decode,
	base32Encode,
	generateRecoveryCode,
	generateTotp,
	generateTotpSecret,
	hashRecoveryCode,
	hotp,
	otpauthUri,
	qrDataUri,
	totpStep,
	verifyTotp
} from './totp';

// Secret des vecteurs de test de la RFC 6238 (annexe B), variante SHA-1.
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890'));

test('base32 aller-retour', () => {
	const buf = Buffer.from([0, 1, 2, 250, 255, 128, 64]);
	expect(base32Decode(base32Encode(buf))).toEqual(buf);
	expect(base32Encode(Buffer.from('foobar'))).toBe('MZXW6YTBOI');
	expect(() => base32Decode('1!')).toThrow();
});

test('vecteurs RFC 6238 (SHA-1, 8 chiffres)', () => {
	const secret = Buffer.from('12345678901234567890');
	const at = (t: number) => hotp(secret, Math.floor(t / TOTP_PERIOD_S), 8);
	expect(at(59)).toBe('94287082');
	expect(at(1111111109)).toBe('07081804');
	expect(at(1234567890)).toBe('89005924');
	expect(at(20000000000)).toBe('65353130');
});

test('génération 6 chiffres cohérente avec les vecteurs RFC', () => {
	expect(generateTotp(RFC_SECRET, 59_000)).toBe('287082');
	expect(generateTotp(RFC_SECRET, 1234567890_000)).toBe('005924');
});

test('vérification dans la fenêtre ±1 pas, refus au-delà', () => {
	const now = 1_700_000_000_000;
	const secret = generateTotpSecret();
	const step = totpStep(now);
	const codeAt = (s: number) => generateTotp(secret, s * TOTP_PERIOD_S * 1000);
	expect(verifyTotp(secret, codeAt(step), { now })).toBe(step);
	expect(verifyTotp(secret, codeAt(step - 1), { now })).toBe(step - 1);
	expect(verifyTotp(secret, codeAt(step + 1), { now })).toBe(step + 1);
	// Secret fixe : pas de collision fortuite avec les codes de la fenêtre.
	const fixed = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
	const fixedAt = (s: number) => generateTotp(fixed, s * TOTP_PERIOD_S * 1000);
	expect(verifyTotp(fixed, fixedAt(step - 2), { now })).toBeNull();
	expect(verifyTotp(fixed, fixedAt(step + 2), { now })).toBeNull();
});

test('anti-rejeu : un pas déjà utilisé (ou antérieur) est refusé', () => {
	const now = 1_700_000_000_000;
	const secret = generateTotpSecret();
	const code = generateTotp(secret, now);
	const step = verifyTotp(secret, code, { now });
	expect(step).not.toBeNull();
	expect(verifyTotp(secret, code, { now, lastStep: step })).toBeNull();
	expect(verifyTotp(secret, code, { now, lastStep: step! - 1 })).toBe(step);
});

test('formats invalides refusés', () => {
	const secret = generateTotpSecret();
	expect(verifyTotp(secret, '')).toBeNull();
	expect(verifyTotp(secret, 'abcdef')).toBeNull();
	expect(verifyTotp(secret, '1234567')).toBeNull();
});

test('URI otpauth et QR code en data URI SVG (compatible CSP)', () => {
	const uri = otpauthUri('JBSWY3DPEHPK3PXP', 'op@example.test');
	expect(uri).toMatch(/^otpauth:\/\/totp\/redfish%3Aop%40example\.test\?/);
	expect(uri).toContain('secret=JBSWY3DPEHPK3PXP');
	const qr = qrDataUri(uri);
	expect(qr.startsWith('data:image/svg+xml;base64,')).toBe(true);
	const svg = Buffer.from(qr.split(',')[1], 'base64').toString();
	expect(svg).toContain('<svg');
	expect(svg).not.toContain('<script');
});

test('codes de secours : format, unicité, empreinte normalisée', () => {
	const code = generateRecoveryCode();
	expect(code).toMatch(/^[A-Z2-7]{4}-[A-Z2-7]{4}-[A-Z2-7]{4}-[A-Z2-7]{4}$/);
	expect(generateRecoveryCode()).not.toBe(code);
	expect(hashRecoveryCode(code.toLowerCase().replace(/-/g, ' '))).toBe(hashRecoveryCode(code));
});

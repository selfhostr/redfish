import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import { decryptSecret, deriveKey, encryptSecret } from './crypto';

beforeEach(() => {
	vi.stubEnv('REDFISH_SECRET_KEY', 'test-key-for-unit-tests');
});
afterEach(() => {
	vi.unstubAllEnvs();
});

test('deriveKey returns a 32-byte AES-256 key', () => {
	expect(deriveKey('test-key-for-unit-tests')).toHaveLength(32);
});

test('encrypt/decrypt round-trips, ciphertext differs from plaintext', () => {
	const c = encryptSecret('smtp-pw');
	expect(c).not.toContain('smtp-pw');
	expect(decryptSecret(c)).toBe('smtp-pw');
});

test('new ciphertext carries the v2 (scrypt) version prefix', () => {
	expect(encryptSecret('smtp-pw').startsWith('v2:')).toBe(true);
});

test('a fresh IV makes each ciphertext unique', () => {
	expect(encryptSecret('same')).not.toBe(encryptSecret('same'));
});

test('tampered ciphertext is rejected', () => {
	const c = encryptSecret('smtp-pw');
	const buf = Buffer.from(c.slice('v2:'.length), 'base64');
	buf[buf.length - 1] ^= 1;
	expect(() => decryptSecret('v2:' + buf.toString('base64'))).toThrow();
});

test('a different key cannot decrypt', () => {
	const c = encryptSecret('smtp-pw');
	vi.stubEnv('REDFISH_SECRET_KEY', 'another-key');
	expect(() => decryptSecret(c)).toThrow();
});

test('missing or empty key fails fast', () => {
	vi.stubEnv('REDFISH_SECRET_KEY', '');
	expect(() => encryptSecret('x')).toThrow(/REDFISH_SECRET_KEY/);
});

// Backward compatibility: values written by the old bare-SHA-256 scheme have no
// version prefix and must still decrypt after the KDF is hardened.
test('legacy (unprefixed, SHA-256) ciphertext still decrypts', () => {
	const raw = 'test-key-for-unit-tests';
	const legacyKey = createHash('sha256').update(raw, 'utf8').digest();
	const iv = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', legacyKey, iv);
	const ct = Buffer.concat([cipher.update('legacy-pw', 'utf8'), cipher.final()]);
	const legacy = Buffer.concat([iv, cipher.getAuthTag(), ct]).toString('base64');
	expect(legacy.startsWith('v2:')).toBe(false);
	expect(decryptSecret(legacy)).toBe('legacy-pw');
});

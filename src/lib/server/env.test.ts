import { afterEach, expect, test, vi } from 'vitest';
import { randomBytes } from 'node:crypto';
import { validateEnv, validateHosts } from './env';

afterEach(() => {
	vi.unstubAllEnvs();
});

test('throws when REDFISH_SECRET_KEY is missing', () => {
	const prev = process.env.REDFISH_SECRET_KEY;
	delete process.env.REDFISH_SECRET_KEY;
	try {
		expect(() => validateEnv()).toThrow(/REDFISH_SECRET_KEY/);
	} finally {
		if (prev !== undefined) process.env.REDFISH_SECRET_KEY = prev;
	}
});

test('throws when REDFISH_SECRET_KEY is empty or whitespace', () => {
	vi.stubEnv('REDFISH_SECRET_KEY', '   ');
	expect(() => validateEnv()).toThrow(/REDFISH_SECRET_KEY/);
});

test('throws on a low-entropy short key', () => {
	vi.stubEnv('REDFISH_SECRET_KEY', 'test-key-for-unit-tests');
	expect(() => validateEnv()).toThrow(/REDFISH_SECRET_KEY/);
});

test('rejects a key that decodes to fewer than 32 bytes', () => {
	vi.stubEnv('REDFISH_SECRET_KEY', randomBytes(16).toString('base64'));
	expect(() => validateEnv()).toThrow(/REDFISH_SECRET_KEY/);
});

test('accepts a 32-byte hex key (openssl rand -hex 32)', () => {
	vi.stubEnv('REDFISH_SECRET_KEY', randomBytes(32).toString('hex'));
	expect(() => validateEnv()).not.toThrow();
});

test('accepts a 32-byte base64 key (openssl rand -base64 32)', () => {
	vi.stubEnv('REDFISH_SECRET_KEY', randomBytes(32).toString('base64'));
	expect(() => validateEnv()).not.toThrow();
});

test('rejects a partial host isolation config', () => {
	const ok = { DASHBOARD_HOST: 'a.example', TRACKING_HOST: 'b.example' };
	expect(() => validateHosts(ok)).not.toThrow();
	expect(() => validateHosts({})).not.toThrow();
	expect(() => validateHosts({ DASHBOARD_HOST: 'a.example' })).toThrow(/TRACKING_HOST/);
	expect(() => validateHosts({ TRACKING_HOST: 'b.example', DASHBOARD_HOST: ' ' })).toThrow(
		/DASHBOARD_HOST/
	);
});

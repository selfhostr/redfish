import { beforeEach, expect, test, vi } from 'vitest';
import { rootCertificates } from 'node:tls';

const transportOptions: Record<string, unknown>[] = [];
vi.mock('nodemailer', () => ({
	default: {
		createTransport: (opts: Record<string, unknown>) => {
			transportOptions.push(opts);
			return {};
		}
	}
}));
vi.mock('$lib/server/sending-profiles', () => ({ getSmtpPassword: async () => 'pw' }));
const readModuleCa = vi.fn<() => string | null>();
vi.mock('./module', () => ({ MAIL_MODULE_HOST: 'mail', readModuleCa: () => readModuleCa() }));

import { buildTransport } from './mailer';

const profile = { id: 'p1', host: 'mail', port: 587, username: 'redfish' };
const PEM = '-----BEGIN CERTIFICATE-----\nAAAA\n-----END CERTIFICATE-----\n';

beforeEach(() => {
	transportOptions.length = 0;
	readModuleCa.mockReset();
});

test('adds the module CA to the default roots, never instead of them', async () => {
	readModuleCa.mockReturnValue(PEM);
	await buildTransport(profile);
	const tls = transportOptions[0].tls as { ca: string[]; rejectUnauthorized?: boolean };
	expect(tls.ca).toEqual([...rootCertificates, PEM]);
	expect(tls.rejectUnauthorized).not.toBe(false);
});

test('sets no tls.ca without a module CA', async () => {
	readModuleCa.mockReturnValue(null);
	await buildTransport(profile);
	const tls = transportOptions[0].tls as Record<string, unknown> | undefined;
	expect(tls?.ca).toBeUndefined();
	expect(tls?.rejectUnauthorized).not.toBe(false);
});

test('does not trust the module CA for an external host', async () => {
	readModuleCa.mockReturnValue(PEM);
	await buildTransport({ ...profile, host: 'smtp.example.org' });
	const tls = transportOptions[0].tls as Record<string, unknown> | undefined;
	expect(tls?.ca).toBeUndefined();
	expect(tls?.rejectUnauthorized).not.toBe(false);
});

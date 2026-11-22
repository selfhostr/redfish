import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	MAIL_MODULE_HOST,
	mailModuleConfig,
	mailModulePublicDir,
	readModuleCa,
	readModuleDkim
} from './module';

describe('mailModuleConfig', () => {
	test('returns null without MAIL_DOMAIN', () => {
		expect(mailModuleConfig({})).toBeNull();
		expect(mailModuleConfig({ MAIL_DOMAIN: '  ' })).toBeNull();
	});

	test('applies defaults and normalises the domain', () => {
		expect(MAIL_MODULE_HOST).toBe('mail');
		expect(mailModuleConfig({ MAIL_DOMAIN: ' Verify-Mail.CH ' })).toEqual({
			domain: 'verify-mail.ch',
			hostname: 'mail.verify-mail.ch',
			selector: 'redfish',
			smtpUser: 'redfish',
			smtpPassword: null
		});
	});

	test('honours explicit values', () => {
		expect(
			mailModuleConfig({
				MAIL_DOMAIN: 'example.org',
				MAIL_HOSTNAME: 'smtp.example.org',
				MAIL_DKIM_SELECTOR: 's1',
				MAIL_SMTP_USER: 'bot',
				MAIL_SMTP_PASSWORD: 'x'.repeat(24)
			})
		).toEqual({
			domain: 'example.org',
			hostname: 'smtp.example.org',
			selector: 's1',
			smtpUser: 'bot',
			smtpPassword: 'x'.repeat(24)
		});
	});
});

describe('module artefacts', () => {
	let dir: string;
	const prevUrl = process.env.DATABASE_URL;
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'redfish-mail-'));
		mkdirSync(join(dir, 'mail', 'public'), { recursive: true });
		process.env.DATABASE_URL = `file:${join(dir, 'redfish.db')}`;
	});
	afterEach(() => {
		if (prevUrl === undefined) delete process.env.DATABASE_URL;
		else process.env.DATABASE_URL = prevUrl;
		rmSync(dir, { recursive: true, force: true });
	});

	test('public dir sits next to the database', () => {
		expect(mailModulePublicDir()).toBe(join(dir, 'mail', 'public'));
	});

	test('readModuleCa reads on every call and returns null when missing', () => {
		expect(readModuleCa()).toBeNull();
		const pem = '-----BEGIN CERTIFICATE-----\nAAAA\n-----END CERTIFICATE-----\n';
		writeFileSync(join(dir, 'mail', 'public', 'ca.crt'), pem);
		expect(readModuleCa()).toBe(pem);
		writeFileSync(join(dir, 'mail', 'public', 'ca.crt'), pem + pem);
		expect(readModuleCa()).toBe(pem + pem);
	});

	test('readModuleDkim parses the two-line file', () => {
		writeFileSync(
			join(dir, 'mail', 'public', 'dkim.txt'),
			'redfish\nv=DKIM1; k=rsa; p=MIIBIjANBg\n'
		);
		expect(readModuleDkim()).toEqual({
			selector: 'redfish',
			value: 'v=DKIM1; k=rsa; p=MIIBIjANBg'
		});
	});

	test('readModuleDkim returns null when missing or garbled', () => {
		expect(readModuleDkim()).toBeNull();
		writeFileSync(join(dir, 'mail', 'public', 'dkim.txt'), 'only-one-line\n');
		expect(readModuleDkim()).toBeNull();
		writeFileSync(join(dir, 'mail', 'public', 'dkim.txt'), 'sel\nnot a dkim record\n');
		expect(readModuleDkim()).toBeNull();
	});
});

import { describe, expect, test } from 'vitest';
import { classifyHost, isTrackingPath, hostAllows } from './hosts';

const both = { dashboard: 'dash.example.org', tracking: 'go.example.net' };
const none = { dashboard: undefined, tracking: undefined };

describe('isTrackingPath', () => {
	test('seul /t/ est du tracking', () => {
		expect(isTrackingPath('/t/p/abc')).toBe(true);
		expect(isTrackingPath('/t')).toBe(false);
		expect(isTrackingPath('/tx/p')).toBe(false);
		expect(isTrackingPath('/login')).toBe(false);
	});
});

describe('classifyHost', () => {
	test('reconnaît dashboard, tracking, autre (insensible à la casse)', () => {
		expect(classifyHost('DASH.example.org', both)).toBe('dashboard');
		expect(classifyHost('go.example.net', both)).toBe('tracking');
		expect(classifyHost('evil.test', both)).toBe('unknown');
	});
	test('non configuré => any', () => {
		expect(classifyHost('localhost:5173', none)).toBe('any');
		expect(classifyHost('x', { dashboard: 'a', tracking: undefined })).toBe('any');
	});
});

describe('hostAllows', () => {
	test('chemins partagés servis même sur un hôte inconnu (healthcheck 127.0.0.1)', () => {
		expect(hostAllows('127.0.0.1:3000', '/health', both)).toBe(true);
		expect(hostAllows('127.0.0.1:3000', '/_app/immutable/a.js', both)).toBe(true);
		expect(hostAllows('127.0.0.1:3000', '/favicon.ico', both)).toBe(true);
		// mais l'app et le tracking restent verrouillés sur un hôte inconnu
		expect(hostAllows('127.0.0.1:3000', '/login', both)).toBe(false);
		expect(hostAllows('127.0.0.1:3000', '/t/p/x', both)).toBe(false);
	});
	test('dashboard refuse /t/', () => {
		expect(hostAllows('dash.example.org', '/t/p/x', both)).toBe(false);
		expect(hostAllows('dash.example.org', '/login', both)).toBe(true);
	});
	test('tracking refuse l’app opérateur', () => {
		expect(hostAllows('go.example.net', '/login', both)).toBe(false);
		expect(hostAllows('go.example.net', '/', both)).toBe(false);
		expect(hostAllows('go.example.net', '/t/p/x', both)).toBe(true);
		expect(hostAllows('go.example.net', '/_app/immutable/a.js', both)).toBe(true);
		expect(hostAllows('go.example.net', '/health', both)).toBe(true);
	});
	test('hôte inconnu refusé, dev permissif', () => {
		expect(hostAllows('evil.test', '/t/p/x', both)).toBe(false);
		expect(hostAllows('localhost', '/t/p/x', none)).toBe(true);
		expect(hostAllows('localhost', '/login', none)).toBe(true);
	});
});

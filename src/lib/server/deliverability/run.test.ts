import { beforeEach, expect, test, vi } from 'vitest';
import { clearDeliverabilityCache, runDeliverabilityChecks } from './run';
import type { Resolver } from './checks';

const enotfound = () => Promise.reject(Object.assign(new Error('x'), { code: 'ENOTFOUND' }));
let calls = 0;
const resolver: Resolver = {
	resolveTxt: (n) => {
		calls++;
		return n === 'd.test' ? Promise.resolve([['v=spf1 -all']]) : enotfound();
	},
	resolve4: () => enotfound(),
	reverse: () => enotfound()
};
const connect = vi.fn(async () => true);

beforeEach(() => {
	calls = 0;
	connect.mockClear();
	clearDeliverabilityCache();
	vi.unstubAllEnvs();
	vi.stubEnv('MAIL_DOMAIN', '');
});

test('domaine externe : SPF/DKIM/DMARC vérifiés, le reste laissé au prestataire', async () => {
	const { checks } = await runDeliverabilityChecks('d.test', {}, { resolver, connect });
	expect(checks.map((c) => c.id)).toEqual(['spf', 'dkim', 'dmarc', 'ptr', 'port25', 'dnsbl']);
	expect(checks[0].status).toBe('ok');
	expect(checks[1].status).toBe('unknown');
	expect(checks[2].status).toBe('fail');
	expect(connect).not.toHaveBeenCalled();
});

test('cache de 5 min par domaine, contourné par force', async () => {
	await runDeliverabilityChecks('d.test', {}, { resolver, connect });
	const first = calls;
	await runDeliverabilityChecks('d.test', {}, { resolver, connect });
	expect(calls).toBe(first);
	await runDeliverabilityChecks('d.test', { force: true }, { resolver, connect });
	expect(calls).toBe(first * 2);
});

test('module configuré mais arrêté : les contrôles DNS, port 25 et DNSBL s’exécutent quand même', async () => {
	vi.stubEnv('MAIL_DOMAIN', 'd.test');
	vi.stubEnv('DATABASE_URL', 'file:/nonexistent/redfish.db');
	const { checks } = await runDeliverabilityChecks('d.test', {}, { resolver, connect });
	expect(checks).toHaveLength(6);
	expect(connect).toHaveBeenCalledWith('gmail-smtp-in.l.google.com', 25, 5000);
	expect(checks.find((c) => c.id === 'ptr')?.status).toBe('fail');
	expect(checks.find((c) => c.id === 'dnsbl')?.status).toBe('unknown');
	expect(checks.find((c) => c.id === 'dkim')?.record).toBeUndefined();
});

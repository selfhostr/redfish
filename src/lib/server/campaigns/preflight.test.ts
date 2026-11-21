import { expect, test } from 'vitest';
import type { Scenario } from '$lib/server/db/schema';
import { evaluatePreflight } from './preflight';
import type { PreflightInput } from './preflight';

const now = new Date('2026-06-01T12:00:00Z');
const H = 3600_000;

const scenario = { id: 's', title: 'Colis', enabled: true } as Scenario;
const okRenderers = {
	email: async () => ({ subject: 's', html: '<p>x</p>' }),
	landing: async () => '<p>x</p>',
	awareness: async () => '<p>x</p>'
};

const base = (over: Partial<PreflightInput> = {}): PreflightInput => ({
	campaign: { status: 'draft', trackingDomain: 'track.example.test', scheduledAt: null },
	targets: [{ email: 'a@x.test', anonymizedAt: null }],
	profile: {
		id: 'p',
		tenantId: null,
		name: 'SMTP',
		host: 'smtp.example.test',
		port: 587,
		username: 'u',
		fromName: 'F',
		fromAddress: 'f@example.test',
		headersJson: null,
		createdAt: now
	},
	scenario,
	authorizations: [
		{ validFrom: new Date(now.getTime() - H), validUntil: new Date(now.getTime() + H) }
	],
	now,
	origin: 'https://app.example.test',
	hosts: {},
	renderers: okRenderers,
	...over
});

const msgs = (r: Awaited<ReturnType<typeof evaluatePreflight>>, sev: string) =>
	r.items.filter((i) => i.severity === sev).map((i) => i.message);

test('complete campaign: ok, no error, no warning', async () => {
	const r = await evaluatePreflight(base());
	expect(r).toMatchObject({ ok: true, errors: 0, warnings: 0, sendable: 1, total: 1 });
});

test('excludes anonymized and invalid targets with a warning', async () => {
	const r = await evaluatePreflight(
		base({
			targets: [
				{ email: 'a@x.test', anonymizedAt: null },
				{ email: 'gone@x.test', anonymizedAt: now },
				{ email: 'not-an-email', anonymizedAt: null }
			]
		})
	);
	expect(r.ok).toBe(true);
	expect(r.sendable).toBe(1);
	expect(r.excluded).toEqual({ anonymized: 1, invalid: 1 });
	expect(r.warnings).toBe(2);
});

test('blocks when no target can be sent to', async () => {
	expect((await evaluatePreflight(base({ targets: [] }))).ok).toBe(false);
	const r = await evaluatePreflight(base({ targets: [{ email: 'x', anonymizedAt: null }] }));
	expect(r.ok).toBe(false);
});

test('blocks on missing or incomplete profile', async () => {
	expect((await evaluatePreflight(base({ profile: null }))).ok).toBe(false);
	const p = base().profile!;
	const r = await evaluatePreflight(base({ profile: { ...p, host: ' ', fromAddress: 'bad' } }));
	expect(r.ok).toBe(false);
	expect(msgs(r, 'error').join(' ')).toMatch(/serveur/);
});

test('blocks on missing, disabled or non-rendering scenario', async () => {
	expect((await evaluatePreflight(base({ scenario: null }))).ok).toBe(false);
	expect((await evaluatePreflight(base({ scenario: { ...scenario, enabled: false } }))).ok).toBe(
		false
	);
	const r = await evaluatePreflight(
		base({
			renderers: {
				...okRenderers,
				email: async () => {
					throw new Error('MJML cassé');
				},
				landing: async () => ' '
			}
		})
	);
	expect(r.ok).toBe(false);
	expect(msgs(r, 'error')).toHaveLength(2);
	expect(msgs(r, 'error').join(' ')).toContain('MJML cassé');
});

test('blocks without a valid authorization, also at the scheduled time', async () => {
	expect((await evaluatePreflight(base({ authorizations: [] }))).ok).toBe(false);
	const later = new Date(now.getTime() + 5 * H);
	const r = await evaluatePreflight(
		base({
			campaign: { status: 'scheduled', trackingDomain: 't.example.test', scheduledAt: later }
		})
	);
	expect(r.ok).toBe(false);
});

test('past scheduled time is only a warning', async () => {
	const r = await evaluatePreflight(
		base({
			campaign: {
				status: 'scheduled',
				trackingDomain: 't.example.test',
				scheduledAt: new Date(now.getTime() - 60_000)
			}
		})
	);
	expect(r.ok).toBe(true);
	expect(r.warnings).toBe(1);
});

test('tracking: missing domain blocks; ORIGIN and host mismatches warn', async () => {
	const blocked = await evaluatePreflight(
		base({ campaign: { status: 'draft', trackingDomain: '', scheduledAt: null } })
	);
	expect(blocked.ok).toBe(false);
	const r = await evaluatePreflight(
		base({
			origin: undefined,
			hosts: { dashboard: 'track.example.test', tracking: 'other.example.test' }
		})
	);
	expect(r.ok).toBe(true);
	expect(r.warnings).toBe(3);
});

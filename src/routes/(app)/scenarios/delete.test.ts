import { beforeEach, expect, test, vi } from 'vitest';

vi.mock('$lib/server/db', async () => {
	const { createTestDb } = await import('$lib/server/db/test-db');
	return { db: createTestDb() };
});

import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	auditLog,
	authorizations,
	campaignRecipients,
	campaigns,
	scenarios,
	sendingProfiles,
	targetLists,
	tenants
} from '$lib/server/db/schema';
import type { User } from '$lib/server/db/schema';
import { createCampaign } from '$lib/server/campaigns';
import { createTenant } from '$lib/server/tenant';
import { load as pickerLoad } from '../campaigns/new/+page.server';
import { actions, load } from './+page.server';

const superadmin = { id: 'a1', email: 'admin@example.test', role: 'superadmin' } as unknown as User;
const operator = { id: 'o1', email: 'op@example.test', role: 'operator' } as unknown as User;

const values = (key: string) => ({
	key,
	title: key,
	category: 'c',
	locale: 'fr',
	difficulty: 'easy',
	path: '/s'
});

const form = (key: string) => {
	const fd = new FormData();
	fd.set('key', key);
	return { request: { formData: async () => fd } };
};
const run = (name: 'delete' | 'restore', user: User | null, key: string) =>
	(actions[name] as (e: unknown) => Promise<Record<string, unknown>>)({
		...form(key),
		locals: { user }
	});

const list = async (url = 'http://x/scenarios') =>
	(await load({ locals: { user: superadmin }, url: new URL(url) } as unknown as Parameters<
		typeof load
	>[0])) as { scenarios: { key: string }[] };

let tenantA: string;
let tenantB: string;

async function useScenario(key: string, tenantId: string) {
	const sc = db.select().from(scenarios).where(eq(scenarios.key, key)).get()!;
	const sp = db
		.insert(sendingProfiles)
		.values({
			tenantId,
			name: 'p',
			host: 'h',
			port: 25,
			username: 'u',
			passwordEnc: 'x',
			fromName: 'f',
			fromAddress: 'a@b.test'
		})
		.returning()
		.get();
	const tl = db.insert(targetLists).values({ tenantId, name: 'l' }).returning().get();
	return createCampaign({
		tenantId,
		name: 'c',
		scenarioId: sc.id,
		sendingProfileId: sp.id,
		targetListId: tl.id,
		trackingDomain: 't.test'
	});
}

beforeEach(async () => {
	db.delete(authorizations).run();
	db.delete(campaignRecipients).run();
	db.delete(campaigns).run();
	db.delete(targetLists).run();
	db.delete(sendingProfiles).run();
	db.delete(scenarios).run();
	db.delete(auditLog).run();
	db.delete(tenants).run();
	tenantA = (await createTenant({ name: 'A' })).id;
	tenantB = (await createTenant({ name: 'B' })).id;
	db.insert(scenarios)
		.values([values('unused'), values('used')])
		.run();
});

test('unused scenario is really deleted and audited', async () => {
	const r = await run('delete', superadmin, 'unused');
	expect(r.removed).toBe('deleted');
	expect(db.select().from(scenarios).where(eq(scenarios.key, 'unused')).get()).toBeUndefined();
	expect(
		db
			.select()
			.from(auditLog)
			.all()
			.map((a) => a.action)
	).toEqual(['scenario.delete']);
});

test('scenario used by a campaign is archived, not deleted', async () => {
	const campaign = await useScenario('used', tenantA);
	const r = await run('delete', superadmin, 'used');
	expect(r.removed).toBe('archived');
	const row = db.select().from(scenarios).where(eq(scenarios.key, 'used')).get();
	expect(row?.archivedAt).toBeInstanceOf(Date);
	// Campaign history still resolves its scenario.
	expect(campaign.scenarioId).toBe(row?.id);
	expect(
		db
			.select()
			.from(auditLog)
			.all()
			.map((a) => a.action)
	).toEqual(['scenario.archive']);
});

test('use by a campaign of another tenant also leads to archiving', async () => {
	await useScenario('used', tenantB);
	expect((await run('delete', superadmin, 'used')).removed).toBe('archived');
});

test('archived scenario is hidden from the list and the campaign picker, and can be restored', async () => {
	await useScenario('used', tenantA);
	await run('delete', superadmin, 'used');

	expect((await list()).scenarios.map((s) => s.key)).toEqual(['unused']);
	expect((await list('http://x/scenarios?archived=1')).scenarios.map((s) => s.key).sort()).toEqual([
		'unused',
		'used'
	]);
	const picker = (await pickerLoad({
		locals: { user: superadmin },
		cookies: { get: () => tenantA, delete: () => {}, set: () => {} }
	} as unknown as Parameters<typeof pickerLoad>[0])) as { scenarios: { key: string }[] };
	expect(picker.scenarios.map((s) => s.key)).toEqual(['unused']);

	const sc = db.select().from(scenarios).where(eq(scenarios.key, 'used')).get()!;
	await expect(
		createCampaign({
			tenantId: tenantA,
			name: 'x',
			scenarioId: sc.id,
			sendingProfileId: 'x',
			targetListId: 'y',
			trackingDomain: 't.test'
		})
	).rejects.toThrow();

	expect((await run('restore', superadmin, 'used')).restored).toBe(true);
	expect((await list()).scenarios.map((s) => s.key).sort()).toEqual(['unused', 'used']);
});

test('non superadmin and anonymous callers are refused', async () => {
	for (const name of ['delete', 'restore'] as const) {
		const r = (await run(name, operator, 'unused')) as { status: number };
		expect(r.status).toBe(403);
		expect(((await run(name, null, 'unused')) as { status: number }).status).toBe(401);
	}
	expect(db.select().from(scenarios).where(eq(scenarios.key, 'unused')).get()).toBeDefined();
});

test('unknown key returns 404', async () => {
	expect(((await run('delete', superadmin, 'nope')) as { status: number }).status).toBe(404);
	expect(((await run('restore', superadmin, 'nope')) as { status: number }).status).toBe(404);
});

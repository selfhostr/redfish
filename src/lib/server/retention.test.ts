import { beforeEach, expect, test, vi } from 'vitest';

vi.mock('$lib/server/db', async () => {
	const { createTestDb } = await import('./db/test-db');
	return { db: createTestDb() };
});

import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	campaignRecipients,
	campaigns,
	events,
	scenarios,
	sendingProfiles,
	targetLists,
	targets,
	tenants
} from '$lib/server/db/schema';
import { createCampaign } from './campaigns';
import { createTenant } from './tenant';
import { campaignFunnel } from './tracking/stats';
import { anonymizeExpired } from './retention';

const DAY = 86_400_000;
let tenantId: string;
let listId: string;
let scenarioId: string;
let profileId: string;

beforeEach(async () => {
	db.delete(events).run();
	db.delete(campaignRecipients).run();
	db.delete(campaigns).run();
	db.delete(targets).run();
	db.delete(targetLists).run();
	db.delete(sendingProfiles).run();
	db.delete(scenarios).run();
	db.delete(tenants).run();
	tenantId = (await createTenant({ name: 'A' })).id;
	scenarioId = db
		.insert(scenarios)
		.values({ key: 's1', title: 'S', category: 'c', locale: 'fr', difficulty: 'easy', path: '/s' })
		.returning()
		.get().id;
	profileId = db
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
		.get().id;
	listId = db.insert(targetLists).values({ tenantId, name: 'l' }).returning().get().id;
});

async function setup(name: string, ageDays: number, status: 'completed' | 'sending' = 'completed') {
	const t = db
		.insert(targets)
		.values({
			listId,
			tenantId,
			firstName: name,
			lastName: name,
			email: `${name}@x.test`,
			department: 'Finance'
		})
		.returning()
		.get();
	const c = await createCampaign({
		tenantId,
		name: `C-${name}`,
		scenarioId,
		sendingProfileId: profileId,
		targetListId: listId,
		trackingDomain: 'track.example.test'
	});
	db.update(campaigns)
		.set({ status, createdAt: new Date(Date.now() - ageDays * DAY) })
		.where(eq(campaigns.id, c.id))
		.run();
	const r = db
		.insert(campaignRecipients)
		.values({ campaignId: c.id, targetId: t.id, token: `tok-${name}` })
		.returning()
		.get();
	for (const type of ['sent', 'opened', 'clicked'] as const)
		db.insert(events).values({ campaignRecipientId: r.id, type }).run();
	return { target: t, campaignId: c.id };
}

test('expired target is anonymized and the funnel is unchanged', async () => {
	const old = await setup('old', 400);
	const before = await campaignFunnel(old.campaignId);
	const eventsBefore = db.select().from(events).all().length;

	expect(await anonymizeExpired()).toEqual({ anonymized: 1, deleted: 0 });

	const t = db.select().from(targets).where(eq(targets.id, old.target.id)).get()!;
	expect(t.firstName).toBe('');
	expect(t.lastName).toBe('');
	expect(t.email).toBe(`redacted-${t.id}@redacted.invalid`);
	expect(t.department).toBeNull();
	expect(t.anonymizedAt).toBeInstanceOf(Date);
	expect(await campaignFunnel(old.campaignId)).toEqual(before);
	expect(before.clicked).toBe(1);
	expect(db.select().from(events).all().length).toBe(eventsBefore);
	expect(db.select().from(campaignRecipients).all().length).toBe(1);
});

test('target within retention, or with a running campaign, is untouched; idempotent', async () => {
	const fresh = await setup('fresh', 10);
	const running = await setup('running', 400, 'sending');
	const old = await setup('old', 400);
	expect((await anonymizeExpired()).anonymized).toBe(1);
	expect((await anonymizeExpired()).anonymized).toBe(0);
	for (const x of [fresh, running]) {
		const t = db.select().from(targets).where(eq(targets.id, x.target.id)).get()!;
		expect(t.firstName).toBe(x.target.firstName);
		expect(t.email).toBe(x.target.email);
		expect(t.anonymizedAt).toBeNull();
	}
	expect(
		db.select().from(targets).where(eq(targets.id, old.target.id)).get()!.anonymizedAt
	).not.toBeNull();
});

test('a target shared with a recent campaign is kept', async () => {
	const old = await setup('shared', 400);
	const c2 = await createCampaign({
		tenantId,
		name: 'recent',
		scenarioId,
		sendingProfileId: profileId,
		targetListId: listId,
		trackingDomain: 'track.example.test'
	});
	db.update(campaigns).set({ status: 'completed' }).where(eq(campaigns.id, c2.id)).run();
	db.insert(campaignRecipients)
		.values({ campaignId: c2.id, targetId: old.target.id, token: 'tok-2' })
		.run();
	expect((await anonymizeExpired()).anonymized).toBe(0);
});

test("respects each tenant's retentionDays", async () => {
	db.update(tenants).set({ retentionDays: 500 }).where(eq(tenants.id, tenantId)).run();
	await setup('old', 400);
	expect((await anonymizeExpired()).anonymized).toBe(0);
	expect((await anonymizeExpired(new Date(Date.now() + 200 * DAY))).anonymized).toBe(1);
});

test('unused targets are deleted after retentionDays since creation, not before', async () => {
	const mk = (name: string, ageDays: number) =>
		db
			.insert(targets)
			.values({
				listId,
				tenantId,
				firstName: name,
				lastName: name,
				email: `${name}@x.test`,
				createdAt: new Date(Date.now() - ageDays * DAY)
			})
			.returning()
			.get();
	const oldUnused = mk('oldunused', 400);
	const freshUnused = mk('freshunused', 5);
	const used = await setup('usedrecent', 10);

	expect(await anonymizeExpired()).toEqual({ anonymized: 0, deleted: 1 });
	expect(db.select().from(targets).where(eq(targets.id, oldUnused.id)).get()).toBeUndefined();
	expect(db.select().from(targets).where(eq(targets.id, freshUnused.id)).get()).toBeDefined();
	expect(db.select().from(targets).where(eq(targets.id, used.target.id)).get()).toBeDefined();
});

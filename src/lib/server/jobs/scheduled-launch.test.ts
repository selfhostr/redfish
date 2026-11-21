import { beforeEach, expect, test, vi } from 'vitest';

vi.mock('$lib/server/db', async () => {
	const { createTestDb } = await import('../db/test-db');
	return { db: createTestDb() };
});

import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	authorizations,
	campaignRecipients,
	campaigns,
	jobs,
	scenarios,
	sendingProfiles,
	targetLists,
	targets,
	tenants
} from '$lib/server/db/schema';
import { createAuthorization } from '../authorization';
import { createCampaign } from '../campaigns';
import { createTenant } from '../tenant';
import { launchDueCampaigns, scheduleLaunchCheck } from './handlers/scheduled-launch';

const H = 3600_000;
const now = new Date('2026-06-01T12:00:00Z');
let tenantId: string;
let campaignId: string;

beforeEach(async () => {
	db.delete(jobs).run();
	db.delete(campaignRecipients).run();
	db.delete(authorizations).run();
	db.delete(campaigns).run();
	db.delete(targets).run();
	db.delete(targetLists).run();
	db.delete(sendingProfiles).run();
	db.delete(scenarios).run();
	db.delete(tenants).run();
	tenantId = (await createTenant({ name: 'A' })).id;
	const sc = db
		.insert(scenarios)
		.values({ key: 's1', title: 'S', category: 'c', locale: 'fr', difficulty: 'easy', path: '/s' })
		.returning()
		.get();
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
	for (const n of ['a', 'b'])
		db.insert(targets)
			.values({ listId: tl.id, tenantId, firstName: n, lastName: n, email: `${n}@x.test` })
			.run();
	campaignId = (
		await createCampaign({
			tenantId,
			name: 'C',
			scenarioId: sc.id,
			sendingProfileId: sp.id,
			targetListId: tl.id,
			trackingDomain: 'track.example.test'
		})
	).id;
});

const authorize = () =>
	createAuthorization({
		tenantId,
		campaignId,
		reference: 'ACC-1',
		validFrom: new Date(now.getTime() - H),
		validUntil: new Date(now.getTime() + H),
		approvedBy: 'RK'
	});

const schedule = (at: Date) =>
	db
		.update(campaigns)
		.set({ status: 'scheduled', scheduledAt: at })
		.where(eq(campaigns.id, campaignId))
		.run();
const status = () => db.select().from(campaigns).where(eq(campaigns.id, campaignId)).get()!.status;

test('a due scheduled campaign with valid authorization is launched', async () => {
	await authorize();
	schedule(new Date(now.getTime() - 60_000));
	expect(await launchDueCampaigns(now)).toBe(1);
	expect(status()).toBe('sending');
	expect(db.select().from(campaignRecipients).all()).toHaveLength(2);
});

test('a not-yet-due scheduled campaign is not launched', async () => {
	await authorize();
	schedule(new Date(now.getTime() + 60_000));
	expect(await launchDueCampaigns(now)).toBe(0);
	expect(status()).toBe('scheduled');
	expect(db.select().from(campaignRecipients).all()).toHaveLength(0);
});

test('a due scheduled campaign without valid authorization is not launched', async () => {
	schedule(new Date(now.getTime() - 60_000));
	expect(await launchDueCampaigns(now)).toBe(0);
	expect(status()).toBe('scheduled');
	expect(db.select().from(campaignRecipients).all()).toHaveLength(0);
});

test('scheduleLaunchCheck does not enqueue duplicates', async () => {
	await scheduleLaunchCheck(now);
	await scheduleLaunchCheck(now);
	expect(db.select().from(jobs).where(eq(jobs.type, 'scheduled-launch')).all()).toHaveLength(1);
});

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
import { launchCampaign, STAGGER_MS } from './launch';

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

test('launch creates recipients with distinct tokens, staggered jobs, status sending', async () => {
	await authorize();
	expect(await launchCampaign(campaignId, now)).toEqual({ recipients: 2 });
	const recs = db.select().from(campaignRecipients).all();
	expect(recs).toHaveLength(2);
	expect(recs.every((r) => r.token.length > 0 && r.sendStatus === 'pending')).toBe(true);
	expect(new Set(recs.map((r) => r.token)).size).toBe(2);
	const js = db.select().from(jobs).all();
	expect(js).toHaveLength(2);
	expect(js.every((j) => j.type === 'send-email' && j.status === 'queued')).toBe(true);
	const times = js.map((j) => j.runAt.getTime()).sort((a, b) => a - b);
	expect(times[0]).toBe(Math.floor(now.getTime() / 1000) * 1000);
	expect(times[1] - times[0]).toBe(STAGGER_MS);
	expect(db.select().from(campaigns).where(eq(campaigns.id, campaignId)).get()!.status).toBe(
		'sending'
	);
});

test('launch throws without valid authorization and creates nothing', async () => {
	await expect(launchCampaign(campaignId, now)).rejects.toThrow(/Aucune autorisation/);
	expect(db.select().from(campaignRecipients).all()).toHaveLength(0);
	expect(db.select().from(jobs).all()).toHaveLength(0);
});

test('launch refuses a campaign already sending', async () => {
	await authorize();
	await launchCampaign(campaignId, now);
	await expect(launchCampaign(campaignId, now)).rejects.toThrow();
	expect(db.select().from(campaignRecipients).all()).toHaveLength(2);
});

test('launch refuses an empty target list and leaves the campaign untouched', async () => {
	await authorize();
	db.delete(targets).run();
	await expect(launchCampaign(campaignId, now)).rejects.toThrow(/Liste de cibles vide/);
	expect(db.select().from(jobs).all()).toHaveLength(0);
	expect(db.select().from(campaigns).where(eq(campaigns.id, campaignId)).get()!.status).toBe(
		'draft'
	);
});

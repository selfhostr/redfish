import { beforeEach, expect, test, vi } from 'vitest';

vi.mock('$lib/server/db', async () => {
	const { createTestDb } = await import('./db/test-db');
	return { db: createTestDb() };
});

import { db } from '$lib/server/db';
import {
	authorizations,
	campaigns,
	scenarios,
	sendingProfiles,
	targetLists,
	tenants
} from '$lib/server/db/schema';
import { canSendCampaign, createAuthorization, latestValidAuthorization } from './authorization';
import { createCampaign } from './campaigns';
import { createTenant } from './tenant';

const H = 3600_000;
const now = new Date('2026-06-01T12:00:00Z');
let tenantId: string;
let campaignId: string;

beforeEach(async () => {
	db.delete(authorizations).run();
	db.delete(campaigns).run();
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

const auth = (validFrom: Date, validUntil: Date) =>
	createAuthorization({
		tenantId,
		campaignId,
		reference: 'ACC-1',
		validFrom,
		validUntil,
		approvedBy: 'RK'
	});

test('canSendCampaign false without authorization', async () => {
	const r = await canSendCampaign(campaignId, now);
	expect(r.ok).toBe(false);
	expect(r.reason).toMatch(/Aucune autorisation/);
});

test('canSendCampaign false when expired', async () => {
	await auth(new Date(now.getTime() - 48 * H), new Date(now.getTime() - H));
	const r = await canSendCampaign(campaignId, now);
	expect(r.ok).toBe(false);
	expect(r.reason).toMatch(/expirée/);
});

test('canSendCampaign false when not yet valid', async () => {
	await auth(new Date(now.getTime() + H), new Date(now.getTime() + 48 * H));
	expect((await canSendCampaign(campaignId, now)).ok).toBe(false);
});

test('canSendCampaign true within validity (bounds inclusive)', async () => {
	await auth(now, new Date(now.getTime() + H));
	expect((await canSendCampaign(campaignId, now)).ok).toBe(true);
	expect((await canSendCampaign(campaignId, new Date(now.getTime() + H))).ok).toBe(true);
	expect((await canSendCampaign(campaignId, new Date(now.getTime() + H + 1))).ok).toBe(false);
});

test('canSendCampaign true when validUntil === now', async () => {
	await auth(new Date(now.getTime() - H), now);
	expect((await canSendCampaign(campaignId, now)).ok).toBe(true);
});

test('createAuthorization rejects other-tenant campaign and bad period', async () => {
	const other = await createTenant({ name: 'B' });
	await expect(
		createAuthorization({
			tenantId: other.id,
			campaignId,
			reference: 'R',
			validFrom: now,
			validUntil: new Date(now.getTime() + H),
			approvedBy: 'x'
		})
	).rejects.toThrow();
	await expect(auth(new Date(now.getTime() + H), now)).rejects.toThrow();
});

test('latestValidAuthorization: la plus récente encore valide, scopée au tenant', async () => {
	expect(await latestValidAuthorization(tenantId, now)).toBeNull();
	await auth(new Date(now.getTime() - 48 * H), new Date(now.getTime() - 24 * H)); // expirée
	expect(await latestValidAuthorization(tenantId, now)).toBeNull();
	await createAuthorization({
		tenantId,
		campaignId,
		reference: 'OLD',
		validFrom: new Date(now.getTime() - 24 * H),
		validUntil: new Date(now.getTime() + 24 * H),
		approvedBy: 'RK'
	});
	await createAuthorization({
		tenantId,
		campaignId,
		reference: 'NEW',
		validFrom: new Date(now.getTime() - 24 * H),
		validUntil: new Date(now.getTime() + 48 * H),
		approvedBy: 'RK'
	});
	expect((await latestValidAuthorization(tenantId, now))?.reference).toBe('NEW');
	const other = (await createTenant({ name: 'B' })).id;
	expect(await latestValidAuthorization(other, now)).toBeNull();
});

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
import { createAuthorization } from './authorization';
import { canSendCampaign } from './authorization';
import {
	createCampaign,
	getCampaign,
	latestTrackingDomain,
	listCampaigns,
	parseSendingPace,
	scheduleCampaign
} from './campaigns';
import { createTenant } from './tenant';

const H = 3600_000;
const now = new Date('2026-06-01T12:00:00Z');
const future = new Date(now.getTime() + 24 * H);
const past = new Date(now.getTime() - 24 * H);
let tenantId: string;
let otherTenantId: string;
let ids: { scenarioId: string; sendingProfileId: string; targetListId: string };
let draftId: string;

beforeEach(async () => {
	db.delete(authorizations).run();
	db.delete(campaigns).run();
	db.delete(targetLists).run();
	db.delete(sendingProfiles).run();
	db.delete(scenarios).run();
	db.delete(tenants).run();
	tenantId = (await createTenant({ name: 'A' })).id;
	otherTenantId = (await createTenant({ name: 'B' })).id;
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
	ids = { scenarioId: sc.id, sendingProfileId: sp.id, targetListId: tl.id };
	draftId = (
		await createCampaign({ tenantId, name: 'C', trackingDomain: 'track.example.test', ...ids })
	).id;
});

test('createCampaign yields a draft and is listed for its tenant only', async () => {
	const list = await listCampaigns(tenantId);
	expect(list).toHaveLength(1);
	expect(list[0].status).toBe('draft');
	expect(await listCampaigns(otherTenantId)).toHaveLength(0);
});

test('createCampaign rejects a target list from another tenant', async () => {
	await expect(
		createCampaign({ tenantId: otherTenantId, name: 'X', trackingDomain: 't.test', ...ids })
	).rejects.toThrow();
});

test('scheduleCampaign throws unless a valid authorization exists', async () => {
	await expect(scheduleCampaign(draftId, future, now)).rejects.toThrow();
	await createAuthorization({
		tenantId,
		campaignId: draftId,
		reference: 'ACC-1',
		validFrom: past,
		validUntil: future,
		approvedBy: 'RK'
	});
	const c = await scheduleCampaign(draftId, future, now);
	expect(c.status).toBe('scheduled');
	expect(c.scheduledAt?.getTime()).toBe(Math.floor(future.getTime() / 1000) * 1000);
});

test('scheduleCampaign throws with only an expired authorization', async () => {
	await createAuthorization({
		tenantId,
		campaignId: draftId,
		reference: 'ACC-1',
		validFrom: new Date(past.getTime() - 24 * H),
		validUntil: past,
		approvedBy: 'RK'
	});
	await expect(scheduleCampaign(draftId, future, now)).rejects.toThrow();
});

test('scheduleCampaign rejects a scheduledAt after validUntil and stays draft', async () => {
	await createAuthorization({
		tenantId,
		campaignId: draftId,
		reference: 'ACC-1',
		validFrom: past,
		validUntil: future,
		approvedBy: 'RK'
	});
	await expect(scheduleCampaign(draftId, new Date(future.getTime() + H), now)).rejects.toThrow();
	expect((await getCampaign(draftId))?.status).toBe('draft');
});

test('authorization of another campaign does not unlock this one', async () => {
	const b = await createCampaign({ tenantId, name: 'B', trackingDomain: 't.test', ...ids });
	await createAuthorization({
		tenantId,
		campaignId: b.id,
		reference: 'ACC-B',
		validFrom: past,
		validUntil: future,
		approvedBy: 'RK'
	});
	expect((await canSendCampaign(draftId, now)).ok).toBe(false);
	await expect(scheduleCampaign(draftId, future, now)).rejects.toThrow();
	expect((await scheduleCampaign(b.id, future, now)).status).toBe('scheduled');
});

test('latestTrackingDomain: domaine de la campagne la plus récente, scopé au tenant', async () => {
	expect(await latestTrackingDomain(otherTenantId)).toBeNull();
	const base = { tenantId, name: 'C', ...ids };
	await createCampaign({ ...base, trackingDomain: 'old.example.test' });
	await createCampaign({ ...base, trackingDomain: 'new.example.test' });
	expect(await latestTrackingDomain(tenantId)).toBe('new.example.test');
	expect(await latestTrackingDomain(otherTenantId)).toBeNull();
});

const form = (v: Record<string, string>) => {
	const f = new FormData();
	for (const [k, x] of Object.entries(v)) f.set(k, x);
	return f;
};

test('parseSendingPace: all at once by default', () => {
	expect(parseSendingPace(form({}))).toMatchObject({ spreadHours: null, workingHoursOnly: false });
	expect(parseSendingPace(form({ sendMode: 'all', spreadAmount: '3' }))).toMatchObject({
		spreadHours: null
	});
});

test('parseSendingPace: spread in hours or days, with working hours', () => {
	expect(
		parseSendingPace(form({ sendMode: 'spread', spreadAmount: '3', spreadUnit: 'days' }))
	).toEqual({ spreadHours: 72, workingHoursOnly: false, workStartHour: 8, workEndHour: 18 });
	expect(
		parseSendingPace(
			form({
				sendMode: 'spread',
				spreadAmount: '6',
				spreadUnit: 'hours',
				workingHoursOnly: 'on',
				workStartHour: '9',
				workEndHour: '17'
			})
		)
	).toEqual({ spreadHours: 6, workingHoursOnly: true, workStartHour: 9, workEndHour: 17 });
});

test('parseSendingPace: rejects out-of-range durations and inverted hours', () => {
	for (const v of [
		{ spreadAmount: '0', spreadUnit: 'hours' },
		{ spreadAmount: '31', spreadUnit: 'days' },
		{ spreadAmount: '1.5', spreadUnit: 'hours' },
		{ spreadAmount: 'x', spreadUnit: 'days' }
	])
		expect(parseSendingPace(form({ sendMode: 'spread', ...v }))).toHaveProperty('error');
	expect(
		parseSendingPace(
			form({
				sendMode: 'spread',
				spreadAmount: '2',
				spreadUnit: 'days',
				workingHoursOnly: 'on',
				workStartHour: '18',
				workEndHour: '8'
			})
		)
	).toHaveProperty('error');
});

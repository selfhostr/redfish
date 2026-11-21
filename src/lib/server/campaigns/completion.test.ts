import { afterEach, beforeEach, expect, test, vi } from 'vitest';

vi.mock('$lib/server/db', async () => {
	const { createTestDb } = await import('../db/test-db');
	return { db: createTestDb() };
});

import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	campaignRecipients,
	campaigns,
	events,
	jobs,
	scenarios,
	sendingProfiles,
	targetLists,
	targets,
	tenants
} from '$lib/server/db/schema';
import { createCampaign } from '../campaigns';
import { createTenant } from '../tenant';
import { anonymizeExpired } from '../retention';
import { recordEvent } from '../tracking/events';
import { tenantTrend } from '../tracking/trends';
import { completeDueCampaigns, observationDays } from './completion';

const DAY = 86_400_000;
const sentAt = new Date('2026-01-01T00:00:00Z');
let tenantId: string;
let campaignId: string;
let recipientId: string;
let targetId: string;

beforeEach(async () => {
	delete process.env.CAMPAIGN_OBSERVATION_DAYS;
	db.delete(events).run();
	db.delete(jobs).run();
	db.delete(campaignRecipients).run();
	db.delete(campaigns).run();
	db.delete(targets).run();
	db.delete(targetLists).run();
	db.delete(sendingProfiles).run();
	db.delete(scenarios).run();
	db.delete(tenants).run();
	tenantId = (await createTenant({ name: 'A' })).id;
	db.update(tenants).set({ retentionDays: 30 }).where(eq(tenants.id, tenantId)).run();
	const scenarioId = db
		.insert(scenarios)
		.values({ key: 's1', title: 'S', category: 'c', locale: 'fr', difficulty: 'easy', path: '/s' })
		.returning()
		.get().id;
	const profileId = db
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
	const listId = db.insert(targetLists).values({ tenantId, name: 'l' }).returning().get().id;
	targetId = db
		.insert(targets)
		.values({ listId, tenantId, firstName: 'a', lastName: 'b', email: 'a@x.test' })
		.returning()
		.get().id;
	campaignId = (
		await createCampaign({
			tenantId,
			name: 'C',
			scenarioId,
			sendingProfileId: profileId,
			targetListId: listId,
			trackingDomain: 't.example.test'
		})
	).id;
	db.update(campaigns)
		.set({ status: 'sending', createdAt: new Date(sentAt.getTime() - DAY) })
		.where(eq(campaigns.id, campaignId))
		.run();
	recipientId = db
		.insert(campaignRecipients)
		.values({ campaignId, targetId, token: 'tok', sendStatus: 'sent', sentAt })
		.returning()
		.get().id;
	db.insert(events).values({ campaignRecipientId: recipientId, type: 'sent' }).run();
});

afterEach(() => {
	delete process.env.CAMPAIGN_OBSERVATION_DAYS;
});

const status = () => db.select().from(campaigns).where(eq(campaigns.id, campaignId)).get()!;
const addJob = (st: 'queued' | 'failed' | 'retry') =>
	db
		.insert(jobs)
		.values({
			type: 'send-email',
			payloadJson: JSON.stringify({ recipientId }),
			runAt: sentAt,
			status: st
		})
		.run();

test('fenêtre par défaut 14 jours, configurable par env', () => {
	expect(observationDays()).toBe(14);
	process.env.CAMPAIGN_OBSERVATION_DAYS = '3';
	expect(observationDays()).toBe(3);
	process.env.CAMPAIGN_OBSERVATION_DAYS = 'abc';
	expect(observationDays()).toBe(14);
});

test('pas de clôture avant la fin de la fenêtre', () => {
	expect(completeDueCampaigns(new Date(sentAt.getTime() + 13 * DAY))).toEqual([]);
	expect(status().status).toBe('sending');
});

test('clôture après la fenêtre, avec completedAt', () => {
	const now = new Date(sentAt.getTime() + 15 * DAY);
	expect(completeDueCampaigns(now)).toEqual([campaignId]);
	expect(status()).toMatchObject({ status: 'completed', completedAt: now });
});

test('un job d’envoi en attente ou en réessai bloque la clôture', () => {
	const later = new Date(sentAt.getTime() + 30 * DAY);
	addJob('queued');
	addJob('retry');
	expect(completeDueCampaigns(later)).toEqual([]);
	db.delete(jobs).run();
	addJob('failed'); // échec définitif : ne bloque pas
	expect(completeDueCampaigns(later)).toEqual([campaignId]);
});

test('les campagnes non « sending » ne sont pas touchées', () => {
	db.update(campaigns).set({ status: 'draft' }).where(eq(campaigns.id, campaignId)).run();
	expect(completeDueCampaigns(new Date(sentAt.getTime() + 30 * DAY))).toEqual([]);
	expect(status().status).toBe('draft');
});

test('rétention : anonymise la cible une fois la campagne clôturée et ancienne', async () => {
	const closed = new Date(sentAt.getTime() + 15 * DAY);
	expect((await anonymizeExpired(closed)).anonymized).toBe(0); // encore « sending »
	completeDueCampaigns(closed);
	expect((await anonymizeExpired(new Date(closed.getTime() + 10 * DAY))).anonymized).toBe(0);
	expect((await anonymizeExpired(new Date(closed.getTime() + 31 * DAY))).anonymized).toBe(1);
	expect(
		db.select().from(targets).where(eq(targets.id, targetId)).get()?.anonymizedAt
	).toBeInstanceOf(Date);
});

test('tendances : la campagne clôturée apparaît', async () => {
	expect(await tenantTrend(tenantId)).toHaveLength(0);
	completeDueCampaigns(new Date(sentAt.getTime() + 15 * DAY));
	expect(await tenantTrend(tenantId)).toHaveLength(1);
});

test('après clôture, les événements de tracking ne sont plus enregistrés', async () => {
	expect(await recordEvent('tok', 'clicked')).toBe(true);
	completeDueCampaigns(new Date(sentAt.getTime() + 15 * DAY));
	expect(await recordEvent('tok', 'opened')).toBe(true); // jeton valide, rien enregistré
	const types = db
		.select()
		.from(events)
		.all()
		.map((e) => e.type)
		.sort();
	expect(types).toEqual(['clicked', 'sent']);
});

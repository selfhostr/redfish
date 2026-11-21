import { beforeEach, expect, test, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';

vi.mock('$lib/server/db', async () => {
	const { createTestDb } = await import('./db/test-db');
	return { db: createTestDb() };
});

import { db } from '$lib/server/db';
import {
	authorizations,
	campaignRecipients,
	campaigns,
	events,
	jobs,
	scenarios,
	sendingProfiles,
	targetLists,
	targets,
	tenants,
	userTenants,
	users
} from '$lib/server/db/schema';
import type { User } from '$lib/server/db/schema';
import { createUser } from './auth';
import { createCampaign, deleteCampaign } from './campaigns';
import { createAuthorization } from './authorization';
import { createTenant } from './tenant';

const H = 3600_000;
const now = new Date('2026-06-01T12:00:00Z');

let operator: User;
let superadmin: User;
let tenantId: string;
let otherTenantId: string;
let scenarioId: string;
let sendingProfileId: string;
let targetListId: string;
let campaignId: string;
let recipientId: string;
let jobId: string;
let authId: string;

// Entités d'une AUTRE campagne/tenant qui doivent survivre à la suppression.
let otherCampaignId: string;
let otherRecipientId: string;
let otherJobId: string;
let otherAuthId: string;
let targetId: string;
let globalProfileId: string;

async function makeInfra(tid: string) {
	const sp = db
		.insert(sendingProfiles)
		.values({
			tenantId: tid,
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
	const tl = db.insert(targetLists).values({ tenantId: tid, name: 'l' }).returning().get();
	const tg = db
		.insert(targets)
		.values({
			listId: tl.id,
			tenantId: tid,
			firstName: 'A',
			lastName: 'B',
			email: `a-${tid}@c.test`
		})
		.returning()
		.get();
	return { sp, tl, tg };
}

beforeEach(async () => {
	db.delete(events).run();
	db.delete(jobs).run();
	db.delete(campaignRecipients).run();
	db.delete(authorizations).run();
	db.delete(campaigns).run();
	db.delete(targets).run();
	db.delete(targetLists).run();
	db.delete(sendingProfiles).run();
	db.delete(scenarios).run();
	db.delete(userTenants).run();
	db.delete(tenants).run();
	db.delete(users).run();

	superadmin = await createUser('admin@example.test', 'pw-admin-123', 'superadmin');
	tenantId = (await createTenant({ name: 'A' })).id;
	otherTenantId = (await createTenant({ name: 'B' })).id;
	operator = await createUser('op@example.test', 'pw-op-12345', 'operator');
	db.insert(userTenants).values({ userId: operator.id, tenantId }).run();

	scenarioId = db
		.insert(scenarios)
		.values({ key: 's1', title: 'S', category: 'c', locale: 'fr', difficulty: 'easy', path: '/s' })
		.returning()
		.get().id;

	const infra = await makeInfra(tenantId);
	sendingProfileId = infra.sp.id;
	targetListId = infra.tl.id;
	targetId = infra.tg.id;
	globalProfileId = db
		.insert(sendingProfiles)
		.values({
			tenantId: null,
			name: 'global',
			host: 'h',
			port: 25,
			username: 'u',
			passwordEnc: 'x',
			fromName: 'f',
			fromAddress: 'g@b.test'
		})
		.returning()
		.get().id;

	campaignId = (
		await createCampaign({
			tenantId,
			name: 'Campagne cible',
			trackingDomain: 't.test',
			scenarioId,
			sendingProfileId,
			targetListId
		})
	).id;
	const rec = db
		.insert(campaignRecipients)
		.values({ campaignId, targetId, token: 'tok-1', sendStatus: 'pending' })
		.returning()
		.get();
	recipientId = rec.id;
	db.insert(events).values({ campaignRecipientId: recipientId, type: 'sent' }).run();
	jobId = db
		.insert(jobs)
		.values({
			type: 'send-email',
			payloadJson: JSON.stringify({ recipientId }),
			runAt: now
		})
		.returning()
		.get().id;
	authId = (
		await createAuthorization({
			tenantId,
			campaignId,
			reference: 'ACC-1',
			approvedBy: 'X',
			validFrom: new Date(now.getTime() - H),
			validUntil: new Date(now.getTime() + H)
		})
	).id;

	// Autre campagne (même tenant) : rien de la sienne ne doit disparaître.
	otherCampaignId = (
		await createCampaign({
			tenantId,
			name: 'Autre campagne',
			trackingDomain: 't.test',
			scenarioId,
			sendingProfileId,
			targetListId
		})
	).id;
	otherRecipientId = db
		.insert(campaignRecipients)
		.values({ campaignId: otherCampaignId, targetId, token: 'tok-2', sendStatus: 'pending' })
		.returning()
		.get().id;
	otherJobId = db
		.insert(jobs)
		.values({
			type: 'send-email',
			payloadJson: JSON.stringify({ recipientId: otherRecipientId }),
			runAt: now
		})
		.returning()
		.get().id;
	otherAuthId = (
		await createAuthorization({
			tenantId,
			campaignId: otherCampaignId,
			reference: 'ACC-2',
			approvedBy: 'X',
			validFrom: new Date(now.getTime() - H),
			validUntil: new Date(now.getTime() + H)
		})
	).id;
});

test('deleteCampaign supprime la campagne, ses destinataires, événements, autorisations et jobs liés', async () => {
	await deleteCampaign(operator, campaignId);
	expect(db.select().from(campaigns).where(eq(campaigns.id, campaignId)).get()).toBeUndefined();
	expect(
		db.select().from(campaignRecipients).where(eq(campaignRecipients.id, recipientId)).get()
	).toBeUndefined();
	expect(
		db.select().from(events).where(eq(events.campaignRecipientId, recipientId)).get()
	).toBeUndefined();
	expect(
		db.select().from(authorizations).where(eq(authorizations.id, authId)).get()
	).toBeUndefined();
	expect(db.select().from(jobs).where(eq(jobs.id, jobId)).get()).toBeUndefined();
});

test('deleteCampaign ne touche pas les autres campagnes, cibles, listes, profils ni scénarios', async () => {
	await deleteCampaign(operator, campaignId);
	expect(db.select().from(campaigns).where(eq(campaigns.id, otherCampaignId)).get()).toBeTruthy();
	expect(
		db.select().from(campaignRecipients).where(eq(campaignRecipients.id, otherRecipientId)).get()
	).toBeTruthy();
	expect(db.select().from(jobs).where(eq(jobs.id, otherJobId)).get()).toBeTruthy();
	expect(
		db.select().from(authorizations).where(eq(authorizations.id, otherAuthId)).get()
	).toBeTruthy();
	expect(db.select().from(targets).where(eq(targets.id, targetId)).get()).toBeTruthy();
	expect(db.select().from(targetLists).where(eq(targetLists.id, targetListId)).get()).toBeTruthy();
	expect(
		db.select().from(sendingProfiles).where(eq(sendingProfiles.id, sendingProfileId)).get()
	).toBeTruthy();
	expect(db.select().from(scenarios).where(eq(scenarios.id, scenarioId)).get()).toBeTruthy();
	void globalProfileId;
});

test('deleteCampaign lève 404 pour une campagne absente', async () => {
	await expect(deleteCampaign(operator, 'inexistante')).rejects.toMatchObject({ status: 404 });
});

test('deleteCampaign lève 403 pour une campagne d’un autre tenant', async () => {
	const foreign = await makeInfra(otherTenantId);
	const foreignCampaignId = (
		await createCampaign({
			tenantId: otherTenantId,
			name: 'Étrangère',
			trackingDomain: 't.test',
			scenarioId,
			sendingProfileId: foreign.sp.id,
			targetListId: foreign.tl.id
		})
	).id;
	await expect(deleteCampaign(operator, foreignCampaignId)).rejects.toMatchObject({ status: 403 });
	expect(db.select().from(campaigns).where(eq(campaigns.id, foreignCampaignId)).get()).toBeTruthy();
});

test('deleteCampaign refuse une campagne en cours d’envoi (status sending)', async () => {
	db.update(campaigns).set({ status: 'sending' }).where(eq(campaigns.id, campaignId)).run();
	await expect(deleteCampaign(operator, campaignId)).rejects.toMatchObject({ status: 409 });
	expect(db.select().from(campaigns).where(eq(campaigns.id, campaignId)).get()).toBeTruthy();
	expect(db.select().from(jobs).where(eq(jobs.id, jobId)).get()).toBeTruthy();
});

test('deleteCampaign autorise un superadmin sur n’importe quel tenant', async () => {
	await deleteCampaign(superadmin, campaignId);
	expect(db.select().from(campaigns).where(eq(campaigns.id, campaignId)).get()).toBeUndefined();
	void and;
});

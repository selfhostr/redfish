import { beforeEach, expect, test, vi } from 'vitest';
import { eq, isNull } from 'drizzle-orm';

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
import { createCampaign } from './campaigns';
import { createAuthorization } from './authorization';
import { createTenant, deleteTenant } from './tenant';

const H = 3600_000;
const now = new Date('2026-06-01T12:00:00Z');

let superadmin: User;
let operator: User;
let tenantId: string;
let otherTenantId: string;
let scenarioId: string;

let recipientId: string;
let jobId: string;
let globalProfileId: string;

// Entités de l'AUTRE tenant qui doivent survivre.
let otherCampaignId: string;
let otherRecipientId: string;
let otherJobId: string;
let otherListId: string;
let otherProfileId: string;

async function seedTenant(tid: string, suffix: string) {
	const sp = db
		.insert(sendingProfiles)
		.values({
			tenantId: tid,
			name: `p-${suffix}`,
			host: 'h',
			port: 25,
			username: 'u',
			passwordEnc: 'x',
			fromName: 'f',
			fromAddress: `a-${suffix}@b.test`
		})
		.returning()
		.get();
	const tl = db
		.insert(targetLists)
		.values({ tenantId: tid, name: `l-${suffix}` })
		.returning()
		.get();
	const tg = db
		.insert(targets)
		.values({
			listId: tl.id,
			tenantId: tid,
			firstName: 'A',
			lastName: 'B',
			email: `t-${suffix}@c.test`
		})
		.returning()
		.get();
	const campaignId = (
		await createCampaign({
			tenantId: tid,
			name: `C-${suffix}`,
			trackingDomain: 't.test',
			scenarioId,
			sendingProfileId: sp.id,
			targetListId: tl.id
		})
	).id;
	const rec = db
		.insert(campaignRecipients)
		.values({ campaignId, targetId: tg.id, token: `tok-${suffix}`, sendStatus: 'pending' })
		.returning()
		.get();
	db.insert(events).values({ campaignRecipientId: rec.id, type: 'sent' }).run();
	const job = db
		.insert(jobs)
		.values({
			type: 'send-email',
			payloadJson: JSON.stringify({ recipientId: rec.id }),
			runAt: now
		})
		.returning()
		.get();
	await createAuthorization({
		tenantId: tid,
		campaignId,
		reference: `ACC-${suffix}`,
		approvedBy: 'X',
		validFrom: new Date(now.getTime() - H),
		validUntil: new Date(now.getTime() + H)
	});
	return { sp, tl, tg, campaignId, recipientId: rec.id, jobId: job.id };
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
	operator = await createUser('op@example.test', 'pw-op-12345', 'operator');
	tenantId = (await createTenant({ name: 'A' })).id;
	otherTenantId = (await createTenant({ name: 'B' })).id;
	db.insert(userTenants).values({ userId: operator.id, tenantId }).run();
	db.insert(userTenants).values({ userId: superadmin.id, tenantId }).run();

	scenarioId = db
		.insert(scenarios)
		.values({ key: 's1', title: 'S', category: 'c', locale: 'fr', difficulty: 'easy', path: '/s' })
		.returning()
		.get().id;

	// Profil global (tenant NULL) : ne doit JAMAIS être supprimé.
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

	const main = await seedTenant(tenantId, 'main');
	recipientId = main.recipientId;
	jobId = main.jobId;

	const other = await seedTenant(otherTenantId, 'other');
	otherCampaignId = other.campaignId;
	otherRecipientId = other.recipientId;
	otherJobId = other.jobId;
	otherListId = other.tl.id;
	otherProfileId = other.sp.id;
});

test('deleteTenant exige un superadmin (403 pour un operator) sans rien supprimer', async () => {
	await expect(deleteTenant(operator, tenantId)).rejects.toMatchObject({ status: 403 });
	expect(db.select().from(tenants).where(eq(tenants.id, tenantId)).get()).toBeTruthy();
	expect(db.select().from(campaigns).where(eq(campaigns.tenantId, tenantId)).all()).toHaveLength(1);
});

test('deleteTenant supprime le client et toute sa cascade', async () => {
	await deleteTenant(superadmin, tenantId);
	expect(db.select().from(tenants).where(eq(tenants.id, tenantId)).get()).toBeUndefined();
	expect(db.select().from(campaigns).where(eq(campaigns.tenantId, tenantId)).all()).toHaveLength(0);
	expect(
		db.select().from(targetLists).where(eq(targetLists.tenantId, tenantId)).all()
	).toHaveLength(0);
	expect(db.select().from(targets).where(eq(targets.tenantId, tenantId)).all()).toHaveLength(0);
	expect(
		db.select().from(sendingProfiles).where(eq(sendingProfiles.tenantId, tenantId)).all()
	).toHaveLength(0);
	expect(
		db.select().from(campaignRecipients).where(eq(campaignRecipients.id, recipientId)).get()
	).toBeUndefined();
	expect(
		db.select().from(events).where(eq(events.campaignRecipientId, recipientId)).get()
	).toBeUndefined();
	expect(db.select().from(jobs).where(eq(jobs.id, jobId)).get()).toBeUndefined();
	expect(
		db.select().from(authorizations).where(eq(authorizations.tenantId, tenantId)).all()
	).toHaveLength(0);
	expect(
		db.select().from(userTenants).where(eq(userTenants.tenantId, tenantId)).all()
	).toHaveLength(0);
});

test('deleteTenant conserve les profils globaux (tenant NULL)', async () => {
	await deleteTenant(superadmin, tenantId);
	const global = db.select().from(sendingProfiles).where(isNull(sendingProfiles.tenantId)).all();
	expect(global.map((p) => p.id)).toContain(globalProfileId);
});

test('deleteTenant n’affecte pas les autres clients', async () => {
	await deleteTenant(superadmin, tenantId);
	expect(db.select().from(tenants).where(eq(tenants.id, otherTenantId)).get()).toBeTruthy();
	expect(db.select().from(campaigns).where(eq(campaigns.id, otherCampaignId)).get()).toBeTruthy();
	expect(
		db.select().from(campaignRecipients).where(eq(campaignRecipients.id, otherRecipientId)).get()
	).toBeTruthy();
	expect(db.select().from(jobs).where(eq(jobs.id, otherJobId)).get()).toBeTruthy();
	expect(db.select().from(targetLists).where(eq(targetLists.id, otherListId)).get()).toBeTruthy();
	expect(
		db.select().from(sendingProfiles).where(eq(sendingProfiles.id, otherProfileId)).get()
	).toBeTruthy();
});

test('deleteTenant ne laisse aucune violation de clé étrangère', async () => {
	await deleteTenant(superadmin, tenantId);
	const violations = db.$client.pragma('foreign_key_check') as unknown[];
	expect(violations).toHaveLength(0);
});

test('deleteTenant lève 404 pour un client absent', async () => {
	await expect(deleteTenant(superadmin, 'inexistant')).rejects.toMatchObject({ status: 404 });
});

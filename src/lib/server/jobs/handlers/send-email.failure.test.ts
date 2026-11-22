import { beforeEach, expect, test, vi } from 'vitest';

vi.mock('$lib/server/db', async () => {
	const { createTestDb } = await import('$lib/server/db/test-db');
	return { db: createTestDb() };
});
const smtp = vi.hoisted(() => ({ ok: false }));
vi.mock('$lib/server/mail/mailer', () => ({
	buildTransport: async () => ({
		sendMail: async () => {
			if (smtp.ok) return;
			throw new Error('535 auth failed password=hunter2 for smtp://user:pw@host');
		}
	})
}));
vi.mock('$lib/server/authorization', () => ({ canSendCampaign: async () => ({ ok: true }) }));
vi.mock('$lib/server/scenarios/render', () => ({
	renderEmail: async () => ({ subject: 's', html: '<p>x</p>' })
}));

import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	campaignRecipients,
	campaigns,
	jobs,
	scenarios,
	sendingProfiles,
	targetLists,
	targets
} from '$lib/server/db/schema';
import { createCampaign } from '$lib/server/campaigns';
import {
	listFailedRecipients,
	listRetryingRecipients,
	retryFailedSends
} from '$lib/server/campaigns/retry';
import { createTenant } from '$lib/server/tenant';
import { enqueue, MAX_ATTEMPTS, runDueJobs } from '$lib/server/jobs/queue';
import './send-email';

let recipientId: string;
let campaignId: string;

beforeEach(async () => {
	smtp.ok = false;
	db.delete(jobs).run();
	db.delete(campaignRecipients).run();
	db.delete(campaigns).run();
	const tenantId = (await createTenant({ name: 'T' + Math.random() })).id;
	const sc = db
		.insert(scenarios)
		.values({
			key: 's' + Math.random(),
			title: 'S',
			category: 'c',
			locale: 'fr',
			difficulty: 'easy',
			path: '/s'
		})
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
	const t = db
		.insert(targets)
		.values({ listId: tl.id, tenantId, firstName: 'a', lastName: 'a', email: 'a@x.test' })
		.returning()
		.get();
	recipientId = db
		.insert(campaignRecipients)
		.values({ campaignId, targetId: t.id, token: 'tok' + Math.random() })
		.returning()
		.get().id;
	db.update(campaigns).set({ status: 'sending' }).where(eq(campaigns.id, campaignId)).run();
});

const rec = () =>
	db.select().from(campaignRecipients).where(eq(campaignRecipients.id, recipientId)).get()!;

test('a permanently failed send job marks the recipient failed with a redacted reason', async () => {
	await enqueue('send-email', { recipientId });
	let now = new Date(Date.now() + 1000);
	for (let i = 0; i < MAX_ATTEMPTS; i++) {
		await runDueJobs(now);
		expect(rec().sendStatus).toBe(i < MAX_ATTEMPTS - 1 ? 'pending' : 'failed');
		const j = db.select().from(jobs).get()!;
		now = new Date(j.runAt.getTime() + 1000);
	}
	const r = rec();
	expect(r.sendError).toContain('535 auth failed');
	expect(r.sendError).not.toContain('hunter2');
	expect(r.sendError).not.toContain('user:pw');
});

test('retryFailedSends re-queues failed recipients only while the campaign is not completed', async () => {
	db.update(campaignRecipients)
		.set({ sendStatus: 'failed', sendError: 'x' })
		.where(eq(campaignRecipients.id, recipientId))
		.run();
	db.update(campaigns).set({ status: 'completed' }).where(eq(campaigns.id, campaignId)).run();
	expect(retryFailedSends(campaignId)).toBe(0);
	expect(rec().sendStatus).toBe('failed');
	db.update(campaigns).set({ status: 'sending' }).where(eq(campaigns.id, campaignId)).run();
	expect(retryFailedSends(campaignId)).toBe(1);
	expect(rec()).toMatchObject({ sendStatus: 'pending', sendError: null });
	expect(db.select().from(jobs).where(eq(jobs.status, 'queued')).all().length).toBe(1);
});

test('a planned send of a campaign no longer sending is skipped, nothing is sent', async () => {
	db.update(campaigns).set({ status: 'completed' }).where(eq(campaigns.id, campaignId)).run();
	await enqueue('send-email', { recipientId });
	const res = await runDueJobs(new Date(Date.now() + 1000));
	expect(res).toEqual({ ran: 1, failed: 0 });
	expect(rec().sendStatus).toBe('skipped');
});

test('a failing attempt records the error but keeps the recipient pending and out of the failed list', async () => {
	await enqueue('send-email', { recipientId });
	await runDueJobs(new Date(Date.now() + 1000));
	expect(rec().sendStatus).toBe('pending');
	expect(rec().sendError).toContain('535 auth failed');
	expect(rec().sendError).not.toContain('hunter2');
	expect(listFailedRecipients(campaignId)).toEqual([]);
	const retrying = listRetryingRecipients(campaignId);
	expect(retrying).toHaveLength(1);
	expect(retrying[0]).toMatchObject({ id: recipientId, attempts: 1 });
	expect(retrying[0].reason).not.toContain('hunter2');
});

test('after MAX_ATTEMPTS the recipient is failed and no longer listed as retrying', async () => {
	await enqueue('send-email', { recipientId });
	let now = new Date(Date.now() + 1000);
	for (let i = 0; i < MAX_ATTEMPTS; i++) {
		await runDueJobs(now);
		now = new Date(db.select().from(jobs).get()!.runAt.getTime() + 1000);
	}
	expect(rec().sendStatus).toBe('failed');
	expect(listRetryingRecipients(campaignId)).toEqual([]);
	expect(listFailedRecipients(campaignId)).toHaveLength(1);
});

test('a success after a failed attempt clears the error', async () => {
	await enqueue('send-email', { recipientId });
	await runDueJobs(new Date(Date.now() + 1000));
	expect(rec().sendError).not.toBeNull();
	smtp.ok = true;
	await runDueJobs(new Date(db.select().from(jobs).get()!.runAt.getTime() + 1000));
	expect(rec()).toMatchObject({ sendStatus: 'sent', sendError: null });
	expect(listRetryingRecipients(campaignId)).toEqual([]);
});

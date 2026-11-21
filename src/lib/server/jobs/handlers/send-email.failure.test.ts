import { beforeEach, expect, test, vi } from 'vitest';

vi.mock('$lib/server/db', async () => {
	const { createTestDb } = await import('$lib/server/db/test-db');
	return { db: createTestDb() };
});
vi.mock('$lib/server/mail/mailer', () => ({
	buildTransport: async () => ({
		sendMail: async () => {
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
import { retryFailedSends } from '$lib/server/campaigns/retry';
import { createTenant } from '$lib/server/tenant';
import { enqueue, MAX_ATTEMPTS, runDueJobs } from '$lib/server/jobs/queue';
import './send-email';

let recipientId: string;
let campaignId: string;

beforeEach(async () => {
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

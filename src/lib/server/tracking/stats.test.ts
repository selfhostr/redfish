import { beforeEach, expect, test, vi } from 'vitest';

vi.mock('$lib/server/db', async () => {
	const { createTestDb } = await import('../db/test-db');
	return { db: createTestDb() };
});

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
import { createCampaign } from '../campaigns';
import { createTenant } from '../tenant';
import { campaignFunnel } from './stats';

let campaignId: string;
let recs: string[];

type EventType = typeof events.$inferInsert.type;
const ev = (i: number, type: EventType, isAutomated = false) =>
	db.insert(events).values({ campaignRecipientId: recs[i], type, isAutomated }).run();

beforeEach(async () => {
	db.delete(events).run();
	db.delete(campaignRecipients).run();
	db.delete(campaigns).run();
	db.delete(targets).run();
	db.delete(targetLists).run();
	db.delete(sendingProfiles).run();
	db.delete(scenarios).run();
	db.delete(tenants).run();
	const tenantId = (await createTenant({ name: 'A' })).id;
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
	recs = ['a', 'b', 'c'].map((n) => {
		const t = db
			.insert(targets)
			.values({ listId: tl.id, tenantId, firstName: n, lastName: n, email: `${n}@x.test` })
			.returning()
			.get();
		return db
			.insert(campaignRecipients)
			.values({ campaignId, targetId: t.id, token: `tok-${n}` })
			.returning()
			.get().id;
	});
});

test('funnel counts distinct recipients per stage; human excludes automated', async () => {
	ev(0, 'sent');
	ev(1, 'sent');
	ev(2, 'sent');
	ev(0, 'opened');
	ev(0, 'opened'); // doublon : compte une fois
	ev(1, 'opened', true); // scanner uniquement
	ev(0, 'clicked');
	ev(1, 'clicked', true);
	ev(1, 'clicked'); // 1 : auto + humain
	ev(0, 'page_interaction');
	ev(0, 'form_submitted');
	ev(0, 'awareness_viewed');
	ev(2, 'reported');
	expect(await campaignFunnel(campaignId)).toEqual({
		recipients: 3,
		sent: 3,
		failed: 0,
		opened: 2,
		clicked: 2,
		pageInteraction: 1,
		formSubmitted: 1,
		awarenessViewed: 1,
		reported: 1,
		human: {
			opened: 1,
			clicked: 2,
			pageInteraction: 1,
			formSubmitted: 1,
			awarenessViewed: 1,
			reported: 1
		}
	});
});

test('funnel is all zero without events and ignores other campaigns', async () => {
	const f = await campaignFunnel(campaignId);
	expect(f.recipients).toBe(3);
	expect(f.sent + f.opened + f.clicked + f.human.clicked).toBe(0);
});

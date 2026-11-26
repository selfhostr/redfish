import { eq, sql } from 'drizzle-orm';
import { beforeEach, expect, test } from 'vitest';
import {
	campaignRecipients,
	campaigns,
	events,
	scenarios,
	sendingProfiles,
	targetLists,
	targets,
	tenants,
	users
} from './schema';
import { createTestDb } from './test-db';

let db: ReturnType<typeof createTestDb>;
beforeEach(() => {
	db = createTestDb();
});

test('insert + read a tenant round-trips', () => {
	const id = crypto.randomUUID();
	db.insert(tenants).values({ id, name: 'Alpina SA' }).run();
	const row = db.select().from(tenants).where(eq(tenants.id, id)).get();
	expect(row?.name).toBe('Alpina SA');
	expect(row?.locale).toBe('fr');
	expect(row?.retentionDays).toBe(365);
	expect(row?.createdAt).toBeInstanceOf(Date);
});

test('users.email is unique', () => {
	const v = { email: 'a@example.com', passwordHash: 'x', role: 'operator' as const };
	db.insert(users).values(v).run();
	expect(() => db.insert(users).values(v).run()).toThrow();
});

test('events.type accepts every funnel stage and round-trips', () => {
	const tenantId = crypto.randomUUID();
	db.insert(tenants).values({ id: tenantId, name: 'T' }).run();
	const scenarioId = crypto.randomUUID();
	db.insert(scenarios)
		.values({
			id: scenarioId,
			key: 'k',
			title: 't',
			category: 'c',
			locale: 'fr',
			difficulty: 'easy',
			path: 'p'
		})
		.run();
	const profileId = crypto.randomUUID();
	db.insert(sendingProfiles)
		.values({
			id: profileId,
			name: 'p',
			host: 'h',
			port: 25,
			username: 'u',
			passwordEnc: 'x',
			fromName: 'f',
			fromAddress: 'a@b.c'
		})
		.run();
	const listId = crypto.randomUUID();
	db.insert(targetLists).values({ id: listId, tenantId, name: 'l' }).run();
	const targetId = crypto.randomUUID();
	db.insert(targets)
		.values({ id: targetId, listId, tenantId, firstName: 'a', lastName: 'b', email: 'a@b.c' })
		.run();
	const campaignId = crypto.randomUUID();
	db.insert(campaigns)
		.values({
			id: campaignId,
			tenantId,
			name: 'c',
			scenarioId,
			sendingProfileId: profileId,
			targetListId: listId,
			trackingDomain: 'd.example'
		})
		.run();
	const recipientId = crypto.randomUUID();
	db.insert(campaignRecipients)
		.values({ id: recipientId, campaignId, targetId, token: 'tok' })
		.run();

	const types = [
		'sent',
		'opened',
		'attachment_opened',
		'clicked',
		'page_interaction',
		'form_submitted',
		'awareness_viewed',
		'reported'
	] as const;
	for (const type of types) {
		db.insert(events).values({ campaignRecipientId: recipientId, type }).run();
	}
	const stored = db
		.select()
		.from(events)
		.all()
		.map((e) => e.type)
		.sort();
	expect(stored).toEqual([...types].sort());
});

test('duplicate (listId, email) in targets is rejected', () => {
	const tenantId = crypto.randomUUID();
	const listId = crypto.randomUUID();
	db.insert(tenants).values({ id: tenantId, name: 'T' }).run();
	db.insert(targetLists).values({ id: listId, tenantId, name: 'L' }).run();
	const row = { listId, tenantId, firstName: 'a', lastName: 'b', email: 'x@a.ch' };
	db.insert(targets).values(row).run();
	expect(() => db.insert(targets).values(row).run()).toThrow(/UNIQUE/i);
});

test('invalid enum values are rejected by CHECK constraints', () => {
	const causeOf = (fn: () => unknown) => {
		try {
			fn();
		} catch (e) {
			return String((e as Error).cause ?? e);
		}
		return 'no error';
	};
	expect(
		causeOf(() =>
			db.run(
				sql`insert into users (id, email, password_hash, role) values ('u1','a@a.ch','h','root')`
			)
		)
	).toMatch(/CHECK/i);
	expect(
		causeOf(() =>
			db.run(
				sql`insert into jobs (id, type, payload_json, run_at, status) values ('j1','t','{}',0,'bogus')`
			)
		)
	).toMatch(/CHECK/i);
	db.run(
		sql`insert into jobs (id, type, payload_json, run_at, status) values ('j2','t','{}',0,'retry')`
	);
});

test('CHECK constraints on campaigns, recipients and events; skipped stays valid', () => {
	const causeOf = (fn: () => unknown) => {
		try {
			fn();
		} catch (e) {
			return String((e as Error).cause ?? e);
		}
		return 'no error';
	};
	db.run(sql`pragma foreign_keys = off`);
	try {
		expect(
			causeOf(() =>
				db.run(
					sql`insert into campaigns (id, tenant_id, name, scenario_id, sending_profile_id, target_list_id, status, tracking_domain) values ('c1','t','n','s','p','l','bogus','d')`
				)
			)
		).toMatch(/CHECK/i);
		expect(
			causeOf(() =>
				db.run(
					sql`insert into campaign_recipients (id, campaign_id, target_id, token, send_status) values ('r1','c','t','tok1','bogus')`
				)
			)
		).toMatch(/CHECK/i);
		expect(
			causeOf(() =>
				db.run(sql`insert into events (id, campaign_recipient_id, type) values ('e1','r','bogus')`)
			)
		).toMatch(/CHECK/i);
		db.run(
			sql`insert into campaign_recipients (id, campaign_id, target_id, token, send_status) values ('r2','c','t','tok2','skipped')`
		);
	} finally {
		db.run(sql`pragma foreign_keys = on`);
	}
});

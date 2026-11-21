import { beforeEach, expect, test, vi } from 'vitest';

vi.mock('$lib/server/db', async () => {
	const { createTestDb } = await import('$lib/server/db/test-db');
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
import { buildReport } from '$lib/server/reports/report';
import { recordManualReports } from './events';
import { campaignFunnel } from './stats';

const ids: { a: string; b: string } = { a: '', b: '' };

function setup(name: string, email: string) {
	const tenant = db.insert(tenants).values({ name }).returning().get();
	const scenario = db
		.insert(scenarios)
		.values({
			key: `k-${name}`,
			title: 't',
			category: 'c',
			locale: 'fr',
			difficulty: 'easy',
			source: 'imported',
			path: null
		})
		.returning()
		.get();
	const profile = db
		.insert(sendingProfiles)
		.values({
			tenantId: tenant.id,
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
	const list = db.insert(targetLists).values({ tenantId: tenant.id, name: 'l' }).returning().get();
	const target = db
		.insert(targets)
		.values({ listId: list.id, tenantId: tenant.id, firstName: 'A', lastName: 'B', email })
		.returning()
		.get();
	const campaign = db
		.insert(campaigns)
		.values({
			tenantId: tenant.id,
			name: name,
			scenarioId: scenario.id,
			sendingProfileId: profile.id,
			targetListId: list.id,
			trackingDomain: 't.test',
			status: 'sending'
		})
		.returning()
		.get();
	db.insert(campaignRecipients)
		.values({
			campaignId: campaign.id,
			targetId: target.id,
			token: `tok-${name}`,
			sendStatus: 'sent'
		})
		.run();
	return campaign.id;
}

beforeEach(() => {
	for (const t of [
		events,
		campaignRecipients,
		campaigns,
		targets,
		targetLists,
		sendingProfiles,
		scenarios,
		tenants
	])
		db.delete(t).run();
	ids.a = setup('A', 'alice@acme.test');
	ids.b = setup('B', 'alice@other.test');
});

test('matches recipients case-insensitively, reports unmatched, dedupes', () => {
	const r = recordManualReports(ids.a, [
		' ALICE@acme.test ',
		'alice@acme.test',
		'nobody@acme.test'
	]);
	expect(r).toEqual({ matched: ['alice@acme.test'], unmatched: ['nobody@acme.test'] });
	recordManualReports(ids.a, ['alice@acme.test']);
	expect(
		db
			.select()
			.from(events)
			.all()
			.filter((e) => e.type === 'reported')
	).toHaveLength(1);
});

test('tenant isolation: an address from another campaign does not match', async () => {
	const r = recordManualReports(ids.a, ['alice@other.test']);
	expect(r.matched).toEqual([]);
	expect(r.unmatched).toEqual(['alice@other.test']);
	expect((await campaignFunnel(ids.b)).reported).toBe(0);
});

test('report and funnel count manual reports as human', async () => {
	recordManualReports(ids.a, ['alice@acme.test']);
	expect((await campaignFunnel(ids.a)).human.reported).toBe(1);
	const report = await buildReport(ids.a, { anonymize: false });
	expect(report.counts.reported).toBe(1);
	expect(report.rates.report).toBe(1);
	expect(report.details?.[0].stage).toBe('Signalé');
});

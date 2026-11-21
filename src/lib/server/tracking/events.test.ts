import { beforeEach, expect, test, vi } from 'vitest';

// Base SQLite en mémoire partagée par tous les modules serveur sous test.
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
	scenarios,
	sendingProfiles,
	targetLists,
	targets,
	tenants
} from '$lib/server/db/schema';
import { recordEvent } from './events';
import { qualifyScanner } from './scanner';

const now = new Date('2026-06-01T12:00:00Z');
const TOKEN = 'valid-token-xyz';
let recipientId: string;

beforeEach(() => {
	for (const table of [
		events,
		campaignRecipients,
		campaigns,
		targets,
		targetLists,
		sendingProfiles,
		scenarios,
		tenants
	])
		db.delete(table).run();

	const tenant = db.insert(tenants).values({ name: 'Acme' }).returning().get();
	const scenario = db
		.insert(scenarios)
		.values({
			key: 'fixture-events',
			title: 'M',
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
		.values({
			listId: list.id,
			tenantId: tenant.id,
			firstName: 'Alice',
			lastName: 'Martin',
			email: 'alice@acme.test'
		})
		.returning()
		.get();
	const campaign = db
		.insert(campaigns)
		.values({
			tenantId: tenant.id,
			name: 'C',
			scenarioId: scenario.id,
			sendingProfileId: profile.id,
			targetListId: list.id,
			trackingDomain: 'track.acme.test',
			status: 'sending'
		})
		.returning()
		.get();
	const recipient = db
		.insert(campaignRecipients)
		.values({
			campaignId: campaign.id,
			targetId: target.id,
			token: TOKEN,
			sendStatus: 'sent',
			sentAt: now
		})
		.returning()
		.get();
	recipientId = recipient.id;
	// L'événement SENT de référence (sert à calculer msSinceSent).
	db.insert(events)
		.values({ campaignRecipientId: recipientId, type: 'sent', createdAt: now })
		.run();
});

test('recordEvent with a valid token inserts the right event type', async () => {
	const ok = await recordEvent(TOKEN, 'form_submitted', { now: new Date(now.getTime() + 120_000) });
	expect(ok).toBe(true);
	const evs = db.select().from(events).where(eq(events.type, 'form_submitted')).all();
	expect(evs).toHaveLength(1);
	expect(evs[0].campaignRecipientId).toBe(recipientId);
});

test('recordEvent with an unknown token returns false and inserts nothing', async () => {
	const before = db.select().from(events).all().length;
	const ok = await recordEvent('unknown-token', 'opened', { now });
	expect(ok).toBe(false);
	expect(db.select().from(events).all().length).toBe(before);
});

test('qualifyScanner flags a Safe Links UA as automated', () => {
	const r = qualifyScanner(
		'Mozilla/5.0 (compatible; MSIE 9.0; Windows NT 6.1; SafeLinks)',
		120_000
	);
	expect(r.isAutomated).toBe(true);
	expect(r.uaCategory).toBe('email-scanner');
});

test('qualifyScanner flags a sub-second click as automated', () => {
	const r = qualifyScanner(
		'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
		300
	);
	expect(r.isAutomated).toBe(true);
});

test('qualifyScanner does not flag a normal UA after 2 minutes', () => {
	const ua =
		'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
	const r = qualifyScanner(ua, 120_000);
	expect(r.isAutomated).toBe(false);
	// Catégorie grossière seulement : jamais la chaîne UA complète (minimisation nLPD).
	expect(r.uaCategory).toBe('desktop');
	expect(r.uaCategory).not.toContain('Mozilla');
});

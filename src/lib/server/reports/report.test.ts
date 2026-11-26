import { beforeEach, expect, test, vi } from 'vitest';
import { eq } from 'drizzle-orm';

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
import { buildReport } from './report';

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

test('agrégats : comptes et taux', async () => {
	ev(0, 'sent');
	ev(1, 'sent');
	ev(2, 'sent');
	ev(0, 'opened');
	ev(1, 'opened');
	ev(1, 'opened', true);
	ev(0, 'clicked');
	ev(0, 'form_submitted');
	ev(0, 'awareness_viewed');
	const r = await buildReport(campaignId, { anonymize: false });
	expect(r.campaignName).toBe('C');
	expect(r.counts).toMatchObject({
		recipients: 3,
		opened: 2,
		clicked: 1,
		formSubmitted: 1,
		awarenessViewed: 1
	});
	expect(r.rates.open).toBeCloseTo(2 / 3);
	expect(r.rates.click).toBeCloseTo(1 / 3);
	expect(r.rates.submission).toBeCloseTo(1 / 3);
	expect(r.rates.awareness).toBeCloseTo(1 / 3);
	expect(r.attentionPoints.length).toBeGreaterThan(0);
	expect(r.recommendations.length).toBeGreaterThan(0);
	expect(r.details?.length).toBe(3);
});

test('anonymisé : aucune donnée individuelle', async () => {
	ev(0, 'sent');
	ev(0, 'opened');
	ev(0, 'clicked');
	ev(0, 'form_submitted');
	const r = await buildReport(campaignId, { anonymize: true });
	const s = JSON.stringify(r);
	expect(s).not.toMatch(/@x\.test/);
	expect(r.details).toBeUndefined();
	expect(r.anonymized).toBe(true);
	const full = JSON.stringify(await buildReport(campaignId, { anonymize: false }));
	expect(full).toMatch(/a@x\.test/);
});

test('taux calculés sur les envois réussis, échecs comptés à part', async () => {
	ev(0, 'sent');
	ev(1, 'sent');
	db.update(campaignRecipients)
		.set({ sendStatus: 'failed', sendError: 'boom' })
		.where(eq(campaignRecipients.id, recs[2]))
		.run();
	ev(0, 'opened');
	ev(0, 'clicked');
	const r = await buildReport(campaignId, { anonymize: false });
	expect(r.counts).toMatchObject({ recipients: 3, sent: 2, failed: 1 });
	expect(r.rates.open).toBeCloseTo(1 / 2);
	expect(r.rates.click).toBeCloseTo(1 / 2);
	expect(r.attentionPoints.join(' ')).toContain('1 envoi(s) en échec');
	expect(r.details?.filter((d) => d.stage === 'Envoi en échec').length).toBe(1);
});

test("détail : un scan automatisé ne fait pas avancer l'étape du destinataire", async () => {
	ev(0, 'sent');
	ev(0, 'opened', true);
	ev(0, 'clicked', true);
	ev(1, 'sent');
	ev(1, 'clicked');
	const r = await buildReport(campaignId, { anonymize: false });
	const stages = r.details?.map((d) => d.stage);
	expect(stages?.filter((s) => s === 'Lien cliqué').length).toBe(1);
	expect(stages?.filter((s) => s === 'Envoyé').length).toBe(1);
});

test('pièce jointe : indicateur attachment_opened dans les comptes, taux et détails', async () => {
	ev(0, 'sent');
	ev(1, 'sent');
	ev(2, 'sent');
	ev(0, 'attachment_opened');
	ev(0, 'clicked');
	ev(1, 'attachment_opened');
	const r = await buildReport(campaignId, { anonymize: false });
	expect(r.counts.attachmentOpened).toBe(2);
	expect(r.rates.attachment).toBeCloseTo(2 / 3);
	// Indicateur PARALLÈLE : signalé par un flag distinct, sans casser l'étape linéaire.
	const byEmail = new Map(r.details?.map((d) => [d.email, d]));
	expect(byEmail.get('a@x.test')?.attachmentOpened).toBe(true);
	expect(byEmail.get('b@x.test')?.attachmentOpened).toBe(true);
	expect(byEmail.get('c@x.test')?.attachmentOpened).toBe(false);
	// Le clic reste l'étape linéaire de a@x.test (ouverture de PJ non linéaire).
	expect(byEmail.get('a@x.test')?.stage).toBe('Lien cliqué');
	expect(r.attentionPoints.join(' ')).toContain('ouvert la pièce jointe');
});

test('campagne sans destinataire : taux à 0', async () => {
	db.delete(events).run();
	db.delete(campaignRecipients).run();
	const r = await buildReport(campaignId, { anonymize: true });
	expect(r.rates.open).toBe(0);
});

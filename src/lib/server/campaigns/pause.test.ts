import { beforeEach, expect, test, vi } from 'vitest';

vi.mock('$lib/server/db', async () => {
	const { createTestDb } = await import('../db/test-db');
	return { db: createTestDb() };
});

import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	authorizations,
	campaignRecipients,
	campaigns,
	jobs,
	scenarios,
	sendingProfiles,
	targetLists,
	targets,
	tenants
} from '$lib/server/db/schema';
import { createAuthorization } from '../authorization';
import { createCampaign } from '../campaigns';
import { createTenant } from '../tenant';
import { launchCampaign, STAGGER_MS } from './launch';
import { editPausedCampaign, pauseCampaign, resumeCampaign } from './pause';

const H = 3600_000;
const now = new Date('2026-06-01T12:00:00Z');
let tenantId: string;
let campaignId: string;

beforeEach(async () => {
	db.delete(jobs).run();
	db.delete(campaignRecipients).run();
	db.delete(authorizations).run();
	db.delete(campaigns).run();
	db.delete(targets).run();
	db.delete(targetLists).run();
	db.delete(sendingProfiles).run();
	db.delete(scenarios).run();
	db.delete(tenants).run();
	tenantId = (await createTenant({ name: 'A' })).id;
	const sc = db
		.insert(scenarios)
		.values({
			key: 's1',
			title: 'S',
			category: 'c',
			locale: 'fr',
			difficulty: 'easy',
			source: 'imported',
			subject: 'Sujet',
			emailTemplate:
				'<mjml><mj-body><mj-section><mj-column><mj-text>Hello</mj-text></mj-column></mj-section></mj-body></mjml>',
			landingTemplate: '<p>landing</p>',
			awarenessTemplate: '<p>awareness</p>'
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
	for (const n of ['a', 'b', 'c'])
		db.insert(targets)
			.values({ listId: tl.id, tenantId, firstName: n, lastName: n, email: `${n}@x.test` })
			.run();
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
	await createAuthorization({
		tenantId,
		campaignId,
		reference: 'ACC-1',
		validFrom: new Date(now.getTime() - H),
		validUntil: new Date(now.getTime() + 60 * 24 * H),
		approvedBy: 'RK'
	});
});

const campaign = () => db.select().from(campaigns).where(eq(campaigns.id, campaignId)).get()!;
const sendJobs = () => db.select().from(jobs).where(eq(jobs.type, 'send-email')).all();
const pendingRecipients = () =>
	db
		.select()
		.from(campaignRecipients)
		.where(
			and(
				eq(campaignRecipients.campaignId, campaignId),
				eq(campaignRecipients.sendStatus, 'pending')
			)
		)
		.all();

test('pause : statut paused, jobs en file/réessai supprimés, destinataires inchangés', async () => {
	await launchCampaign(campaignId, now);
	expect(sendJobs()).toHaveLength(3);
	// Un des jobs passe en réessai (doit aussi être supprimé par la pause).
	const js = sendJobs();
	db.update(jobs).set({ status: 'retry' }).where(eq(jobs.id, js[0].id)).run();

	expect(pauseCampaign(campaignId)).toBe(true);
	expect(campaign().status).toBe('paused');
	// Plus aucun job send-email en file.
	expect(sendJobs()).toHaveLength(0);
	// Les destinataires restent « pending ».
	expect(pendingRecipients()).toHaveLength(3);
});

test('pause : un job déjà « running » n’est pas supprimé', async () => {
	await launchCampaign(campaignId, now);
	const first = sendJobs()[0];
	db.update(jobs).set({ status: 'running' }).where(eq(jobs.id, first.id)).run();
	pauseCampaign(campaignId);
	const remaining = sendJobs();
	expect(remaining).toHaveLength(1);
	expect(remaining[0].status).toBe('running');
});

test('transition illégale : pause refusée hors « sending »', async () => {
	// Encore en brouillon.
	expect(pauseCampaign(campaignId)).toBe(false);
	expect(campaign().status).toBe('draft');
	// Reprise refusée hors « paused ».
	await launchCampaign(campaignId, now);
	expect(resumeCampaign(campaignId, now)).toBe(false);
	expect(campaign().status).toBe('sending');
});

test('resume : remet en file les « pending » et recalcule planned_at à partir de now', async () => {
	await launchCampaign(campaignId, now);
	// Un destinataire déjà envoyé ne doit pas être replanifié.
	const recs = db.select().from(campaignRecipients).all();
	db.update(campaignRecipients)
		.set({ sendStatus: 'sent', sentAt: now })
		.where(eq(campaignRecipients.id, recs[0].id))
		.run();
	pauseCampaign(campaignId);
	expect(sendJobs()).toHaveLength(0);

	const resumeAt = new Date(now.getTime() + 5 * H);
	expect(resumeCampaign(campaignId, resumeAt)).toBe(true);
	expect(campaign().status).toBe('sending');

	// Deux destinataires « pending » remis en file (le « sent » est intact).
	const newJobs = sendJobs();
	expect(newJobs).toHaveLength(2);
	expect(newJobs.every((j) => j.status === 'queued')).toBe(true);
	// planned_at recalculé à partir de l'instant de reprise, pas du lancement.
	for (const j of newJobs) expect(j.runAt.getTime()).toBeGreaterThanOrEqual(resumeAt.getTime());
	const times = newJobs.map((j) => j.runAt.getTime()).sort((a, b) => a - b);
	expect(times[0]).toBe(Math.floor(resumeAt.getTime() / 1000) * 1000);
	expect(times[1] - times[0]).toBe(STAGGER_MS);
	// Le destinataire déjà envoyé reste « sent ».
	const sent = db
		.select()
		.from(campaignRecipients)
		.where(eq(campaignRecipients.id, recs[0].id))
		.get()!;
	expect(sent.sendStatus).toBe('sent');
});

test('edit : domaine de tracking modifié, n’affecte que les envois à venir', async () => {
	await launchCampaign(campaignId, now);
	const recs = db.select().from(campaignRecipients).all();
	db.update(campaignRecipients)
		.set({ sendStatus: 'sent', sentAt: now })
		.where(eq(campaignRecipients.id, recs[0].id))
		.run();
	pauseCampaign(campaignId);

	const res = editPausedCampaign(campaignId, {
		trackingDomain: 'new.example.test',
		awarenessMessage: null,
		pace: {
			spreadHours: null,
			workingHoursOnly: false,
			workStartHour: 8,
			workEndHour: 18
		}
	});
	expect(res.ok).toBe(true);
	if (res.ok) expect(res.changed).toContain('trackingDomain');
	// Le domaine effectif (lu à l'envoi) est bien le nouveau pour les « pending ».
	expect(campaign().trackingDomain).toBe('new.example.test');
	// Le destinataire déjà envoyé n'est pas retouché (son e-mail est parti).
	const sent = db
		.select()
		.from(campaignRecipients)
		.where(eq(campaignRecipients.id, recs[0].id))
		.get()!;
	expect(sent.sendStatus).toBe('sent');
});

test('edit : domaine invalide refusé, campagne inchangée', async () => {
	await launchCampaign(campaignId, now);
	pauseCampaign(campaignId);
	const before = campaign().trackingDomain;
	const res = editPausedCampaign(campaignId, {
		trackingDomain: '   ',
		awarenessMessage: null,
		pace: { spreadHours: null, workingHoursOnly: false, workStartHour: 8, workEndHour: 18 }
	});
	expect(res.ok).toBe(false);
	expect(campaign().trackingDomain).toBe(before);
});

test('edit : refusé si la campagne n’est pas en pause', async () => {
	await launchCampaign(campaignId, now);
	const res = editPausedCampaign(campaignId, {
		trackingDomain: 'new.example.test',
		awarenessMessage: null,
		pace: { spreadHours: null, workingHoursOnly: false, workStartHour: 8, workEndHour: 18 }
	});
	expect(res.ok).toBe(false);
	expect(campaign().trackingDomain).toBe('track.example.test');
});

test('edit : nouveau rythme d’envoi appliqué à la reprise (étalement depuis now)', async () => {
	await launchCampaign(campaignId, now);
	pauseCampaign(campaignId);
	editPausedCampaign(campaignId, {
		trackingDomain: 'track.example.test',
		awarenessMessage: null,
		pace: { spreadHours: 24, workingHoursOnly: false, workStartHour: 8, workEndHour: 18 }
	});
	expect(campaign().spreadHours).toBe(24);
	const resumeAt = new Date(now.getTime() + H);
	resumeCampaign(campaignId, resumeAt);
	const times = sendJobs()
		.map((j) => j.runAt.getTime())
		.sort((a, b) => a - b);
	// Étalé sur 24 h : le dernier envoi est bien après le premier.
	expect(times[times.length - 1]).toBeGreaterThan(times[0]);
	expect(times[0]).toBeGreaterThanOrEqual(resumeAt.getTime());
});

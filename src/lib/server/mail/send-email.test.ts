import { afterEach, beforeEach, expect, test, vi } from 'vitest';

// Base SQLite en mémoire partagée par tous les modules serveur sous test.
vi.mock('$lib/server/db', async () => {
	const { createTestDb } = await import('../db/test-db');
	return { db: createTestDb() };
});

// Stub Nodemailer : aucun vrai serveur SMTP. On capture le message envoyé et
// les options de transport (pour vérifier que le mot de passe ne fuit nulle part).
type SentMessage = Record<string, unknown>;
const sentMessages: SentMessage[] = [];
const transportOptions: Record<string, unknown>[] = [];
vi.mock('nodemailer', () => ({
	default: {
		createTransport: (opts: Record<string, unknown>) => {
			transportOptions.push(opts);
			return {
				sendMail: async (msg: SentMessage) => {
					sentMessages.push(msg);
					return { messageId: 'stub' };
				}
			};
		}
	}
}));

import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	authorizations,
	campaignRecipients,
	campaigns,
	events,
	scenarios,
	sendingProfiles,
	targetLists,
	targets,
	tenants
} from '$lib/server/db/schema';
import { encryptSecret } from '../crypto';
import { buildTrackingUrls, sendRecipient } from '../jobs/handlers/send-email';

const H = 3600_000;
const now = new Date('2026-06-01T12:00:00Z');
const SMTP_PW = 'super-secret-smtp-pw';
const TOKEN = 'AAAA-bbbb_CCCC';

let recipientId: string;
let campaignId: string;

beforeEach(() => {
	vi.stubEnv('REDFISH_SECRET_KEY', 'test-key-for-unit-tests');
	vi.useFakeTimers();
	vi.setSystemTime(now);
	sentMessages.length = 0;
	transportOptions.length = 0;
	db.delete(events).run();
	db.delete(campaignRecipients).run();
	db.delete(authorizations).run();
	db.delete(campaigns).run();
	db.delete(targets).run();
	db.delete(targetLists).run();
	db.delete(sendingProfiles).run();
	db.delete(scenarios).run();
	db.delete(tenants).run();

	const tenant = db.insert(tenants).values({ name: 'Acme' }).returning().get();
	// microsoft365 est le scénario livré avec le dépôt (voir scenarios/).
	const scenario = db
		.insert(scenarios)
		.values({
			key: 'microsoft365',
			title: 'M365',
			category: 'c',
			locale: 'fr',
			difficulty: 'easy',
			path: 'scenarios/microsoft365'
		})
		.returning()
		.get();
	const profile = db
		.insert(sendingProfiles)
		.values({
			tenantId: tenant.id,
			name: 'p',
			host: 'smtp.acme.test',
			port: 587,
			username: 'postmaster@acme.test',
			passwordEnc: encryptSecret(SMTP_PW),
			fromName: 'Équipe IT',
			fromAddress: 'it@acme.test',
			headersJson: JSON.stringify({ 'X-Campaign': 'training' })
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
			email: 'alice.martin@acme.test'
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
	campaignId = campaign.id;
	const recipient = db
		.insert(campaignRecipients)
		.values({ campaignId: campaign.id, targetId: target.id, token: TOKEN, sendStatus: 'pending' })
		.returning()
		.get();
	recipientId = recipient.id;
});

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllEnvs();
});

const authorize = (from = now.getTime() - H, until = now.getTime() + H) =>
	db
		.insert(authorizations)
		.values({
			tenantId: db.select().from(campaigns).where(eq(campaigns.id, campaignId)).get()!.tenantId,
			campaignId,
			reference: 'ACC-1',
			validFrom: new Date(from),
			validUntil: new Date(until),
			approvedBy: 'RK'
		})
		.run();

test('buildTrackingUrls builds the five endpoints from domain + token', () => {
	const urls = buildTrackingUrls('track.acme.test', TOKEN);
	expect(urls.open).toBe(`https://track.acme.test/t/o/${TOKEN}`);
	expect(urls.click).toBe(`https://track.acme.test/t/c/${TOKEN}`);
	expect(urls.submit).toBe(`https://track.acme.test/t/s/${TOKEN}`);
	expect(urls.beacon).toBe(`https://track.acme.test/t/b/${TOKEN}`);
	expect(urls.awareness).toBe(`https://track.acme.test/t/a/${TOKEN}`);
});

test('sendRecipient sends to the target with rendered subject + tracking URLs, records SENT', async () => {
	authorize();
	await sendRecipient(recipientId);

	expect(sentMessages).toHaveLength(1);
	const msg = sentMessages[0];
	expect(msg.to).toBe('alice.martin@acme.test');
	expect(typeof msg.subject).toBe('string');
	expect((msg.subject as string).length).toBeGreaterThan(0);
	expect(msg.from).toEqual({ name: 'Équipe IT', address: 'it@acme.test' });
	expect(msg.headers).toEqual({ 'X-Campaign': 'training' });
	const html = msg.html as string;
	expect(html).toContain(`https://track.acme.test/t/c/${TOKEN}`);
	expect(html).toContain(`https://track.acme.test/t/o/${TOKEN}`);

	// Le transport est bien construit avec l'hôte/port/identifiants du profil.
	expect(transportOptions).toHaveLength(1);
	expect(transportOptions[0]).toMatchObject({
		host: 'smtp.acme.test',
		port: 587,
		// Hors 465, STARTTLS est obligatoire (pas d'envoi en clair dégradé).
		requireTLS: true,
		secure: false,
		auth: { user: 'postmaster@acme.test', pass: SMTP_PW }
	});

	const rec = db
		.select()
		.from(campaignRecipients)
		.where(eq(campaignRecipients.id, recipientId))
		.get()!;
	expect(rec.sendStatus).toBe('sent');
	expect(rec.sentAt).not.toBeNull();

	const evs = db.select().from(events).where(eq(events.campaignRecipientId, recipientId)).all();
	expect(evs).toHaveLength(1);
	expect(evs[0].type).toBe('sent');
});

test('the SMTP password never appears in any logged output', async () => {
	authorize();
	const spies = [
		vi.spyOn(console, 'log').mockImplementation(() => {}),
		vi.spyOn(console, 'info').mockImplementation(() => {}),
		vi.spyOn(console, 'warn').mockImplementation(() => {}),
		vi.spyOn(console, 'error').mockImplementation(() => {}),
		vi.spyOn(console, 'debug').mockImplementation(() => {})
	];
	await sendRecipient(recipientId);
	const logged = spies
		.flatMap((s) => s.mock.calls)
		.flat()
		.map((a) => (typeof a === 'string' ? a : JSON.stringify(a)))
		.join(' ');
	expect(logged).not.toContain(SMTP_PW);
	for (const s of spies) s.mockRestore();
});

test('when authorization is not valid at send time, nothing is sent and status is skipped', async () => {
	// Autorisation déjà expirée à l'instant d'envoi (TOCTOU).
	authorize(now.getTime() - 2 * H, now.getTime() - H);
	await sendRecipient(recipientId);

	expect(sentMessages).toHaveLength(0);
	const rec = db
		.select()
		.from(campaignRecipients)
		.where(eq(campaignRecipients.id, recipientId))
		.get()!;
	expect(rec.sendStatus).toBe('skipped');
	expect(
		db.select().from(events).where(eq(events.campaignRecipientId, recipientId)).all()
	).toHaveLength(0);
});

test('with no authorization at all, status is skipped and nothing is sent', async () => {
	await sendRecipient(recipientId);
	expect(sentMessages).toHaveLength(0);
	expect(
		db.select().from(campaignRecipients).where(eq(campaignRecipients.id, recipientId)).get()!
			.sendStatus
	).toBe('skipped');
});

test('an invalid headersJson does not block the send (no custom headers applied)', async () => {
	authorize();
	// L'opérateur a saisi un JSON malformé (non validé à la création) : l'envoi
	// doit quand même aboutir, sans en-tête personnalisé, plutôt que de lever.
	db.update(sendingProfiles).set({ headersJson: '{ invalide' }).run();

	await expect(sendRecipient(recipientId)).resolves.toBeUndefined();

	expect(sentMessages).toHaveLength(1);
	expect(sentMessages[0].headers).toBeUndefined();

	const rec = db
		.select()
		.from(campaignRecipients)
		.where(eq(campaignRecipients.id, recipientId))
		.get()!;
	expect(rec.sendStatus).toBe('sent');
});

import { beforeEach, expect, test, vi } from 'vitest';
import { isHttpError, isRedirect } from '@sveltejs/kit';

// Base SQLite en mémoire partagée par tous les modules serveur sous test.
vi.mock('$lib/server/db', async () => {
	const { createTestDb } = await import('../../lib/server/db/test-db');
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

import { GET as openGet } from './o/[token]/+server';
import { GET as clickGet } from './c/[token]/+server';
import { POST as beaconPost } from './b/[token]/+server';
import { POST as submitPost } from './s/[token]/+server';
import { load as landingLoad } from './p/[token]/+page.server';
import { load as awarenessLoad } from './a/[token]/+page.server';
import { resetRateLimit } from '$lib/server/ratelimit';
import { SKELETON_AWARENESS, SKELETON_EMAIL, SKELETON_LANDING } from '$lib/scenarios/skeletons';

const TOKEN = 'rec-token-AAAA';

/** Construit un faux RequestEvent minimal (params + request) pour un handler. */
function makeEvent(
	token: string,
	opts: { method?: string; body?: string; ua?: string; ip?: string } = {}
) {
	const headers: Record<string, string> = {};
	if (opts.ua) headers['user-agent'] = opts.ua;
	if (opts.body !== undefined) headers['content-type'] = 'application/x-www-form-urlencoded';
	const request = new Request(`http://localhost/t/_/${token}`, {
		method: opts.method ?? 'GET',
		headers,
		body: opts.body
	});
	return { request, params: { token }, getClientAddress: () => opts.ip ?? '203.0.113.1' };
}

/** Appelle un handler et renvoie l'objet lancé (redirect/error). */
async function thrown(fn: () => unknown): Promise<unknown> {
	try {
		await fn();
	} catch (e) {
		return e;
	}
	throw new Error('aucune exception lancée alors qu’une redirection/erreur était attendue');
}

beforeEach(() => {
	resetRateLimit();
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
	// Scénario importé (contenu en base) : le dépôt ne livre plus aucun scénario.
	const scenario = db
		.insert(scenarios)
		.values({
			key: 'fixture-tracking',
			title: 'Fixture tracking',
			category: 'c',
			locale: 'fr',
			difficulty: 'easy',
			source: 'imported',
			path: null,
			subject: 'Message de test {{firstName}}',
			emailTemplate: SKELETON_EMAIL,
			landingTemplate: SKELETON_LANDING,
			awarenessTemplate: SKELETON_AWARENESS
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
			status: 'sending',
			awarenessMessage: 'Message propre à la campagne.'
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
			sentAt: new Date()
		})
		.returning()
		.get();
	db.insert(events).values({ campaignRecipientId: recipient.id, type: 'sent' }).run();
});

const eventsOfType = (type: string) =>
	db
		.select()
		.from(events)
		.where(eq(events.type, type as 'opened'))
		.all();

test('ZERO-CAPTURE: POST /t/s records exactly one form_submitted, redirects, and never reads/stores the body', async () => {
	const ev = makeEvent(TOKEN, {
		method: 'POST',
		body: 'email=v@x&password=hunter2',
		ua: 'Mozilla/5.0 (Windows NT 10.0) Chrome/120.0 Safari/537.36'
	});

	const result = await thrown(() => submitPost(ev as never));

	// Redirige vers la page de sensibilisation.
	expect(isRedirect(result)).toBe(true);
	expect((result as { status: number }).status).toBe(302);
	expect((result as { location: string }).location).toBe(`/t/a/${TOKEN}`);

	// INVARIANT : le corps de la requête n'a JAMAIS été consommé.
	expect(ev.request.bodyUsed).toBe(false);

	// Exactement un événement form_submitted.
	const submitted = eventsOfType('form_submitted');
	expect(submitted).toHaveLength(1);

	// Aucune valeur saisie n'est stockée nulle part.
	const dump = JSON.stringify([
		db.select().from(events).all(),
		db.select().from(campaignRecipients).all()
	]);
	expect(dump).not.toContain('hunter2');
	expect(dump).not.toContain('v@x');
});

test('POST /t/s with an unknown token is 404, records nothing, reads no body', async () => {
	const ev = makeEvent('nope', { method: 'POST', body: 'email=v@x&password=hunter2' });
	const result = await thrown(() => submitPost(ev as never));
	expect(isHttpError(result)).toBe(true);
	expect((result as { status: number }).status).toBe(404);
	expect(ev.request.bodyUsed).toBe(false);
	expect(eventsOfType('form_submitted')).toHaveLength(0);
});

test('GET /t/o records opened and returns a 1x1 gif', async () => {
	const res = (await openGet(makeEvent(TOKEN, { ua: 'UA' }) as never)) as Response;
	expect(res.status).toBe(200);
	expect(res.headers.get('content-type')).toContain('image/gif');
	expect(eventsOfType('opened')).toHaveLength(1);
});

test('GET /t/o with an unknown token still returns the gif but records nothing', async () => {
	const res = (await openGet(makeEvent('nope', { ua: 'UA' }) as never)) as Response;
	expect(res.status).toBe(200);
	expect(res.headers.get('content-type')).toContain('image/gif');
	expect(eventsOfType('opened')).toHaveLength(0);
});

test('GET /t/c records clicked and redirects to /t/p', async () => {
	const result = await thrown(() => clickGet(makeEvent(TOKEN) as never));
	expect(isRedirect(result)).toBe(true);
	expect((result as { status: number }).status).toBe(302);
	expect((result as { location: string }).location).toBe(`/t/p/${TOKEN}`);
	expect(eventsOfType('clicked')).toHaveLength(1);
});

test('GET /t/c with an unknown token is 404 and records nothing', async () => {
	const result = await thrown(() => clickGet(makeEvent('nope') as never));
	expect(isHttpError(result)).toBe(true);
	expect((result as { status: number }).status).toBe(404);
	expect(eventsOfType('clicked')).toHaveLength(0);
});

test('POST /t/b records page_interaction, returns 204, reads no body', async () => {
	const ev = makeEvent(TOKEN, { method: 'POST', body: 'anything' });
	const res = (await beaconPost(ev as never)) as Response;
	expect(res.status).toBe(204);
	expect(ev.request.bodyUsed).toBe(false);
	expect(eventsOfType('page_interaction')).toHaveLength(1);
});

test('POST /t/b with an unknown token is 404', async () => {
	const result = await thrown(() => beaconPost(makeEvent('nope', { method: 'POST' }) as never));
	expect(isHttpError(result)).toBe(true);
	expect((result as { status: number }).status).toBe(404);
	expect(eventsOfType('page_interaction')).toHaveLength(0);
});

test('GET /t/p renders the landing with form action /t/s and beacon /t/b, no named input', async () => {
	const data = (await landingLoad(makeEvent(TOKEN) as never)) as { html: string };
	const action = data.html.match(/<form[^>]*action="([^"]*)"/i);
	expect(action?.[1]).toBe(`/t/s/${TOKEN}`);
	expect(data.html).toContain(`/t/b/${TOKEN}`);
	expect(/<input[^>]*\bname=/i.test(data.html)).toBe(false);
	// Rendre la page n'enregistre aucun événement.
	expect(eventsOfType('clicked')).toHaveLength(0);
});

test('GET /t/p with an unknown token is 404', async () => {
	const result = await thrown(() => landingLoad(makeEvent('nope') as never));
	expect(isHttpError(result)).toBe(true);
	expect((result as { status: number }).status).toBe(404);
});

test('GET /t/a records awareness_viewed and renders the awareness page with the campaign message', async () => {
	const data = (await awarenessLoad(makeEvent(TOKEN, { ua: 'UA' }) as never)) as { html: string };
	expect(eventsOfType('awareness_viewed')).toHaveLength(1);
	expect(data.html).toContain('Message propre à la campagne.');
});

test('GET /t/a with an unknown token is 404 and records nothing', async () => {
	const result = await thrown(() => awarenessLoad(makeEvent('nope') as never));
	expect(isHttpError(result)).toBe(true);
	expect((result as { status: number }).status).toBe(404);
	expect(eventsOfType('awareness_viewed')).toHaveLength(0);
});

test('POST /t/s under a flood from one IP is rate-limited (429) after the budget', async () => {
	const ip = '198.51.100.50';
	// Les 60 premières requêtes (jeton inconnu) passent le garde-fou : 404.
	for (let i = 0; i < 60; i++) {
		const result = await thrown(() =>
			submitPost(makeEvent('nope', { method: 'POST', ip }) as never)
		);
		expect(isHttpError(result)).toBe(true);
		expect((result as { status: number }).status).toBe(404);
	}
	// La 61e dépasse la limite : 429, bloquée AVANT tout accès base.
	const blocked = await thrown(() =>
		submitPost(makeEvent('nope', { method: 'POST', ip }) as never)
	);
	expect(isHttpError(blocked)).toBe(true);
	expect((blocked as { status: number }).status).toBe(429);

	// Une autre IP conserve son propre budget : non affectée par le flood.
	const other = await thrown(() =>
		submitPost(makeEvent('nope', { method: 'POST', ip: '198.51.100.99' }) as never)
	);
	expect((other as { status: number }).status).toBe(404);
});

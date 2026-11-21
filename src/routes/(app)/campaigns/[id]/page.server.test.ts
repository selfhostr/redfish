import { beforeEach, expect, test, vi } from 'vitest';
import { eq } from 'drizzle-orm';

vi.mock('$lib/server/db', async () => {
	const { createTestDb } = await import('$lib/server/db/test-db');
	return { db: createTestDb() };
});
const spy = vi.hoisted(() => ({ getScenarioById: vi.fn() }));
vi.mock('$lib/server/scenarios/listing', async (orig) => {
	const real = await orig<typeof import('$lib/server/scenarios/listing')>();
	return {
		...real,
		getScenarioById: (id: string) => {
			spy.getScenarioById(id);
			return real.getScenarioById(id);
		}
	};
});

import { db } from '$lib/server/db';
import {
	auditLog,
	campaigns,
	scenarios,
	sendingProfiles,
	targetLists,
	tenants,
	userTenants,
	users
} from '$lib/server/db/schema';
import type { User } from '$lib/server/db/schema';
import { createUser } from '$lib/server/auth';
import { createCampaign } from '$lib/server/campaigns';
import { createTenant } from '$lib/server/tenant';
import { actions, load } from './+page.server';

let operator: User;
let ownId: string;
let foreignId: string;

async function makeCampaign(tenantId: string, scenarioId: string) {
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
	return (
		await createCampaign({
			tenantId,
			name: 'C',
			trackingDomain: 't.example.test',
			scenarioId,
			sendingProfileId: sp.id,
			targetListId: tl.id
		})
	).id;
}

beforeEach(async () => {
	spy.getScenarioById.mockClear();
	db.delete(campaigns).run();
	db.delete(targetLists).run();
	db.delete(sendingProfiles).run();
	db.delete(scenarios).run();
	db.delete(userTenants).run();
	db.delete(tenants).run();
	db.delete(users).run();
	operator = await createUser('op@example.test', 'pw-op-12345', 'operator');
	const mine = await createTenant({ name: 'Mine', linkUserId: operator.id });
	const theirs = await createTenant({ name: 'Theirs' });
	const sc = db
		.insert(scenarios)
		.values({
			key: 's1',
			title: 'S',
			category: 'payment-fraud',
			locale: 'fr',
			difficulty: 'easy',
			tagsJson: '["t"]',
			path: '/s'
		})
		.returning()
		.get();
	ownId = await makeCampaign(mine.id, sc.id);
	foreignId = await makeCampaign(theirs.id, sc.id);
});

const run = (id: string) =>
	load({ locals: { user: operator }, params: { id } } as unknown as Parameters<typeof load>[0]);

test('la fiche expose le scénario de la campagne', async () => {
	const data = (await run(ownId)) as { scenario: Record<string, unknown> | null };
	expect(data.scenario).toMatchObject({
		key: 's1',
		title: 'S',
		category: 'payment-fraud',
		difficulty: 'easy',
		locale: 'fr',
		tags: ['t'],
		enabled: true
	});
});

test('campagne d’un autre tenant : 403 avant tout chargement de scénario', async () => {
	await expect(run(foreignId)).rejects.toMatchObject({ status: 403 });
	expect(spy.getScenarioById).not.toHaveBeenCalled();
});

const del = (id: string, confirm: string) => {
	const body = new FormData();
	body.set('confirm', confirm);
	return actions.delete({
		request: new Request('http://localhost', { method: 'POST', body }),
		locals: { user: operator },
		params: { id }
	} as unknown as Parameters<typeof actions.delete>[0]);
};

test('action delete : nom saisi incorrect -> fail 400, rien supprimé', async () => {
	const res = await del(ownId, 'mauvais nom');
	expect(res).toMatchObject({ status: 400 });
	expect(db.select().from(campaigns).where(eq(campaigns.id, ownId)).get()).toBeTruthy();
});

test('action delete : nom saisi correct -> redirect 303 vers /campaigns et campagne supprimée', async () => {
	await expect(del(ownId, 'C')).rejects.toMatchObject({ status: 303, location: '/campaigns' });
	expect(db.select().from(campaigns).where(eq(campaigns.id, ownId)).get()).toBeUndefined();
});

const complete = (id: string, user: User = operator) =>
	actions.complete({
		request: new Request('http://localhost', { method: 'POST' }),
		locals: { user },
		params: { id }
	} as unknown as Parameters<typeof actions.complete>[0]);

test('action complete : campagne en cours d envoi -> clôturée et auditée', async () => {
	db.update(campaigns).set({ status: 'sending' }).where(eq(campaigns.id, ownId)).run();
	expect(await complete(ownId)).toEqual({ success: true });
	const c = db.select().from(campaigns).where(eq(campaigns.id, ownId)).get();
	expect(c?.status).toBe('completed');
	expect(c?.completedAt).toBeInstanceOf(Date);
	const row = db.select().from(auditLog).where(eq(auditLog.action, 'campaign.complete')).get();
	expect(row?.targetId).toBe(ownId);
});

test('action complete : brouillon -> 409, statut inchangé', async () => {
	expect(await complete(ownId)).toMatchObject({ status: 409 });
	expect(db.select().from(campaigns).where(eq(campaigns.id, ownId)).get()?.status).toBe('draft');
});

test('action complete : campagne d un autre tenant -> 403', async () => {
	db.update(campaigns).set({ status: 'sending' }).where(eq(campaigns.id, foreignId)).run();
	await expect(complete(foreignId)).rejects.toMatchObject({ status: 403 });
	expect(db.select().from(campaigns).where(eq(campaigns.id, foreignId)).get()?.status).toBe(
		'sending'
	);
});

test('actions report et retryFailed : campagne clôturée -> 409', async () => {
	db.update(campaigns).set({ status: 'completed' }).where(eq(campaigns.id, ownId)).run();
	const body = new FormData();
	body.set('emails', 'a@b.test');
	const event = (request: Request) =>
		({ request, locals: { user: operator }, params: { id: ownId } }) as never;
	expect(
		await actions.report(event(new Request('http://localhost', { method: 'POST', body })))
	).toMatchObject({ status: 409 });
	expect(
		await actions.retryFailed(event(new Request('http://localhost', { method: 'POST' })))
	).toMatchObject({ status: 409 });
});

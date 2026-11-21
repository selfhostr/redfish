import { beforeEach, expect, test, vi } from 'vitest';

vi.mock('$lib/server/db', async () => {
	const { createTestDb } = await import('./db/test-db');
	return { db: createTestDb() };
});

import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	auditLog,
	campaignRecipients,
	campaigns,
	events,
	scenarios,
	sendingProfiles,
	targetLists,
	targets,
	tenants
} from '$lib/server/db/schema';
import { audit } from './audit';
import { createCampaign } from './campaigns';
import { createTenant } from './tenant';
import { campaignFunnel } from './tracking/stats';
import {
	anonymizeTarget,
	deleteTarget,
	erasePerson,
	exportPerson,
	findPerson,
	personRef,
	updateTarget
} from './person-data';

let tA: string;
let tB: string;
let listA: string;
let listB: string;
let scenarioId: string;

beforeEach(async () => {
	db.delete(auditLog).run();
	db.delete(events).run();
	db.delete(campaignRecipients).run();
	db.delete(campaigns).run();
	db.delete(targets).run();
	db.delete(targetLists).run();
	db.delete(sendingProfiles).run();
	db.delete(scenarios).run();
	db.delete(tenants).run();
	tA = (await createTenant({ name: 'A' })).id;
	tB = (await createTenant({ name: 'B' })).id;
	listA = db.insert(targetLists).values({ tenantId: tA, name: 'LA' }).returning().get().id;
	listB = db.insert(targetLists).values({ tenantId: tB, name: 'LB' }).returning().get().id;
	scenarioId = db
		.insert(scenarios)
		.values({ key: 's1', title: 'S', category: 'c', locale: 'fr', difficulty: 'easy', path: '/s' })
		.returning()
		.get().id;
});

function mkTarget(tenantId: string, listId: string, email: string, firstName = 'Ann') {
	return db
		.insert(targets)
		.values({ tenantId, listId, email, firstName, lastName: 'Doe', department: 'IT' })
		.returning()
		.get();
}

async function participate(tenantId: string, listId: string, targetId: string, tok: string) {
	const profileId = db
		.insert(sendingProfiles)
		.values({
			tenantId,
			name: 'p' + tok,
			host: 'h',
			port: 25,
			username: 'u',
			passwordEnc: 'x',
			fromName: 'f',
			fromAddress: 'a@b.test'
		})
		.returning()
		.get().id;
	const c = await createCampaign({
		tenantId,
		name: 'Camp ' + tok,
		scenarioId,
		sendingProfileId: profileId,
		targetListId: listId,
		trackingDomain: 'track.example.test'
	});
	const r = db
		.insert(campaignRecipients)
		.values({ campaignId: c.id, targetId, token: tok })
		.returning()
		.get();
	for (const type of ['sent', 'clicked'] as const)
		db.insert(events).values({ campaignRecipientId: r.id, type }).run();
	return c.id;
}

test('updateTarget edits fields, rejects duplicates and other tenants', async () => {
	const a = mkTarget(tA, listA, 'a@x.test');
	mkTarget(tA, listA, 'b@x.test');
	const u = await updateTarget(tA, a.id, {
		email: ' New@X.test ',
		firstName: 'Zed',
		lastName: 'Q',
		department: 'HR'
	});
	expect(u).toMatchObject({ email: 'new@x.test', firstName: 'Zed', department: 'HR' });
	await expect(updateTarget(tA, a.id, { email: 'b@x.test' })).rejects.toThrow('déjà');
	await expect(updateTarget(tA, a.id, { email: 'nope' })).rejects.toThrow('invalide');
	await expect(updateTarget(tB, a.id, { email: 'c@x.test' })).rejects.toThrow('introuvable');
});

test('deleteTarget deletes unused, refuses used and foreign targets', async () => {
	const unused = mkTarget(tA, listA, 'u@x.test');
	const used = mkTarget(tA, listA, 'used@x.test');
	await participate(tA, listA, used.id, 't1');
	await expect(deleteTarget(tB, unused.id)).rejects.toThrow('introuvable');
	await deleteTarget(tA, unused.id);
	expect(db.select().from(targets).where(eq(targets.id, unused.id)).get()).toBeUndefined();
	await expect(deleteTarget(tA, used.id)).rejects.toThrow('anonymisez');
});

test('anonymizeTarget keeps funnel and events, blocks later edits', async () => {
	const t = mkTarget(tA, listA, 'p@x.test');
	const cid = await participate(tA, listA, t.id, 't2');
	const before = await campaignFunnel(cid);
	await anonymizeTarget(tA, t.id);
	const row = db.select().from(targets).where(eq(targets.id, t.id)).get()!;
	expect(row.email).toBe(`redacted-${t.id}@redacted.invalid`);
	expect(row.firstName).toBe('');
	expect(row.anonymizedAt).toBeInstanceOf(Date);
	expect(await campaignFunnel(cid)).toEqual(before);
	await expect(updateTarget(tA, t.id, { email: 'x@x.test' })).rejects.toThrow('anonymisée');
	await expect(anonymizeTarget(tB, t.id)).rejects.toThrow('introuvable');
});

test('exportPerson returns rows, participation and timestamped events, scoped to the tenant', async () => {
	const t = mkTarget(tA, listA, 'p@x.test');
	await participate(tA, listA, t.id, 't3');
	const other = mkTarget(tB, listB, 'p@x.test', 'Other');
	await participate(tB, listB, other.id, 't4');

	const out = await exportPerson(tA, 'P@x.test');
	expect(out.targets).toHaveLength(1);
	const x = out.targets[0];
	expect(x).toMatchObject({ email: 'p@x.test', firstName: 'Ann', list: { name: 'LA' } });
	expect(x.campaigns).toHaveLength(1);
	expect(x.campaigns[0].events.map((e) => e.type).sort()).toEqual(['clicked', 'sent']);
	expect(x.campaigns[0].events[0].at).toMatch(/^\d{4}-\d\d-\d\dT/);
	expect(JSON.stringify(out)).not.toContain('Other');
	expect((await findPerson(tA, 'p@x.test')).map((m) => m.id)).toEqual([t.id]);
	expect(await findPerson(tB, 'nobody@x.test')).toEqual([]);
});

test('erasePerson anonymizes used targets, deletes unused ones, only in its tenant', async () => {
	const used = mkTarget(tA, listA, 'p@x.test');
	await participate(tA, listA, used.id, 't5');
	const list2 = db.insert(targetLists).values({ tenantId: tA, name: 'L2' }).returning().get().id;
	const unused = mkTarget(tA, list2, 'p@x.test');
	const foreign = mkTarget(tB, listB, 'p@x.test');

	expect(await erasePerson(tA, 'p@x.test')).toEqual({ deleted: 1, anonymized: 1 });
	expect(db.select().from(targets).where(eq(targets.id, unused.id)).get()).toBeUndefined();
	expect(
		db.select().from(targets).where(eq(targets.id, used.id)).get()!.anonymizedAt
	).not.toBeNull();
	expect(db.select().from(targets).where(eq(targets.id, foreign.id)).get()!.email).toBe('p@x.test');
});

test('personRef is a salted hash and the audit log never holds the email', () => {
	const ref = personRef(tA, 'p@x.test');
	expect(ref).toMatch(/^[0-9a-f]{16}$/);
	expect(ref).not.toBe(personRef(tB, 'p@x.test'));
	audit(null, 'person.export', { tenantId: tA, targetType: 'person', targetId: ref });
	expect(JSON.stringify(db.select().from(auditLog).all())).not.toContain('p@x.test');
});

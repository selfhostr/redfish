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
	tenants,
	userTenants,
	users
} from '$lib/server/db/schema';
import type { User } from '$lib/server/db/schema';
import { createUser } from '$lib/server/auth';
import { createCampaign } from '$lib/server/campaigns';
import { createTenant } from '$lib/server/tenant';
import { anonymizeExpired } from '$lib/server/retention';
import { GET } from './+server';

let operator: User;
let ownId: string;
let foreignId: string;
let ownTargetId: string;

async function make(tenantId: string, scenarioId: string, emails: string[]) {
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
	const id = (
		await createCampaign({
			tenantId,
			name: 'C',
			trackingDomain: 't.example.test',
			scenarioId,
			sendingProfileId: sp.id,
			targetListId: tl.id
		})
	).id;
	const recs: { rid: string; tid: string }[] = [];
	emails.forEach((email, i) => {
		const t = db
			.insert(targets)
			.values({ listId: tl.id, tenantId, firstName: 'F', lastName: 'L', email })
			.returning()
			.get();
		const r = db
			.insert(campaignRecipients)
			.values({ campaignId: id, targetId: t.id, token: `${id}-${i}`, sentAt: new Date(1000_000) })
			.returning()
			.get();
		recs.push({ rid: r.id, tid: t.id });
	});
	return { id, recs };
}

beforeEach(async () => {
	for (const t of [
		events,
		campaignRecipients,
		campaigns,
		targets,
		targetLists,
		sendingProfiles,
		scenarios,
		userTenants,
		tenants,
		users
	])
		db.delete(t).run();
	operator = await createUser('op@example.test', 'pw-op-12345', 'operator');
	const mine = await createTenant({ name: 'Mine', linkUserId: operator.id });
	const theirs = await createTenant({ name: 'Theirs' });
	const sc = db
		.insert(scenarios)
		.values({ key: 's1', title: 'S', category: 'c', locale: 'fr', difficulty: 'easy', path: '/s' })
		.returning()
		.get();
	const own = await make(mine.id, sc.id, ['a@x.test', '=cmd@x.test']);
	ownId = own.id;
	ownTargetId = own.recs[0].tid;
	foreignId = (await make(theirs.id, sc.id, ['secret@other.test'])).id;
	db.insert(events)
		.values([
			{ campaignRecipientId: own.recs[0].rid, type: 'clicked', createdAt: new Date(2000_000) },
			{
				campaignRecipientId: own.recs[1].rid,
				type: 'clicked',
				isAutomated: true,
				createdAt: new Date(2000_000)
			}
		])
		.run();
});

const call = (id: string, user: User | null = operator) =>
	GET({ locals: { user }, params: { id } } as unknown as Parameters<typeof GET>[0]);

test('CSV : colonnes, horodatages et échappement des formules', async () => {
	const res = await call(ownId);
	expect(res.headers.get('content-type')).toContain('text/csv');
	const lines = (await res.text()).trim().split('\r\n');
	expect(lines[0]).toContain('email,nom,prenom');
	const a = lines.find((l) => l.startsWith('a@x.test'))!;
	expect(a).toContain(',oui,non,oui,non,non,');
	expect(a).toContain('1970-01-01T01:33:20+01:00');
	// clic automatisé ignoré ; e-mail commençant par = neutralisé
	const f = lines.find((l) => l.includes("'=cmd@x.test"))!;
	expect(f).toContain(',oui,non,non,non,non,');
});

test('cible anonymisée : export de ce qui reste, sans ré-identification', async () => {
	db.update(campaigns)
		.set({ status: 'completed', createdAt: new Date(0) })
		.run();
	await anonymizeExpired();
	const csv = await (await call(ownId)).text();
	expect(csv).not.toContain('a@x.test');
	expect(csv).toContain(`redacted-${ownTargetId}@redacted.invalid`);
});

test('authz : anonyme refusé, autre tenant refusé, inconnu 404', async () => {
	await expect(call(ownId, null)).rejects.toMatchObject({ status: 401 });
	await expect(call(foreignId)).rejects.toBeTruthy();
	await expect(call('nope')).rejects.toMatchObject({ status: 404 });
});

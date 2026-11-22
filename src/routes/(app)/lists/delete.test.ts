import { beforeEach, expect, test, vi } from 'vitest';

vi.mock('$lib/server/db', async () => {
	const { createTestDb } = await import('$lib/server/db/test-db');
	return { db: createTestDb() };
});

import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	auditLog,
	campaignRecipients,
	campaigns,
	scenarios,
	sendingProfiles,
	targetLists,
	targets,
	tenants
} from '$lib/server/db/schema';
import type { User } from '$lib/server/db/schema';
import { createCampaign } from '$lib/server/campaigns';
import { createTenant } from '$lib/server/tenant';
import { load as pickerLoad } from '../campaigns/new/+page.server';
import { actions as detailActions } from './[listId]/+page.server';
import { actions, load } from './+page.server';

const superadmin = { id: 'a1', email: 'admin@example.test', role: 'superadmin' } as unknown as User;
const operator = { id: 'o1', email: 'op@example.test', role: 'operator' } as unknown as User;

let tenantA: string;
let tenantB: string;
let scenarioId: string;
let profileId: string;

const fd = (o: Record<string, string>) => {
	const f = new FormData();
	for (const [k, v] of Object.entries(o)) f.set(k, v);
	return f;
};
const ctx = (user: User | null, tenantId: string, data: Record<string, string> = {}) => ({
	request: { formData: async () => fd(data) },
	locals: { user },
	cookies: { get: () => tenantId, delete: () => {}, set: () => {} },
	url: new URL('http://x/lists')
});
const run = (name: 'delete' | 'restore', user: User | null, tenantId: string, id: string) =>
	(actions[name] as (e: unknown) => Promise<Record<string, unknown>>)(ctx(user, tenantId, { id }));
const runDetail = (
	name: 'rename' | 'deleteList' | 'restoreList',
	user: User | null,
	tenantId: string,
	listId: string,
	data: Record<string, string> = {}
) =>
	(detailActions[name] as (e: unknown) => Promise<Record<string, unknown>>)({
		...ctx(user, tenantId, data),
		params: { listId }
	});
const names = async (url = 'http://x/lists') =>
	(
		(await load({
			...ctx(superadmin, tenantA),
			url: new URL(url)
		} as unknown as Parameters<typeof load>[0])) as { lists: { name: string }[] }
	).lists.map((l) => l.name);
const audits = () =>
	db
		.select()
		.from(auditLog)
		.all()
		.map((a) => a.action);

function newList(tenantId: string, name: string, withTarget = true) {
	const l = db.insert(targetLists).values({ tenantId, name }).returning().get();
	if (withTarget)
		db.insert(targets)
			.values({ listId: l.id, tenantId, firstName: 'f', lastName: 'l', email: `${name}@x.test` })
			.run();
	return l;
}
async function useList(listId: string, tenantId: string) {
	return createCampaign({
		tenantId,
		name: 'c',
		scenarioId,
		sendingProfileId: profileId,
		targetListId: listId,
		trackingDomain: 't.test'
	});
}

beforeEach(async () => {
	db.delete(campaignRecipients).run();
	db.delete(campaigns).run();
	db.delete(targets).run();
	db.delete(targetLists).run();
	db.delete(sendingProfiles).run();
	db.delete(scenarios).run();
	db.delete(auditLog).run();
	db.delete(tenants).run();
	tenantA = (await createTenant({ name: 'A' })).id;
	tenantB = (await createTenant({ name: 'B' })).id;
	scenarioId = db
		.insert(scenarios)
		.values({ key: 's', title: 's', category: 'c', locale: 'fr', difficulty: 'easy', path: '/s' })
		.returning()
		.get().id;
	profileId = db
		.insert(sendingProfiles)
		.values({
			tenantId: tenantA,
			name: 'p',
			host: 'h',
			port: 25,
			username: 'u',
			passwordEnc: 'x',
			fromName: 'f',
			fromAddress: 'a@b.test'
		})
		.returning()
		.get().id;
});

test('unused list is deleted with its targets and audited without the name', async () => {
	const l = newList(tenantA, 'dupont@example.test');
	expect((await run('delete', superadmin, tenantA, l.id)).removed).toBe('deleted');
	expect(db.select().from(targetLists).all()).toEqual([]);
	expect(db.select().from(targets).all()).toEqual([]);
	expect(audits()).toEqual(['list.delete']);
	expect(JSON.stringify(db.select().from(auditLog).all())).not.toContain('dupont');
});

test('used list is archived, targets and campaign kept', async () => {
	const l = newList(tenantA, 'Staff');
	const c = await useList(l.id, tenantA);
	expect((await run('delete', superadmin, tenantA, l.id)).removed).toBe('archived');
	expect(db.select().from(targetLists).get()?.archivedAt).toBeInstanceOf(Date);
	expect(db.select().from(targets).all()).toHaveLength(1);
	expect(db.select().from(campaigns).where(eq(campaigns.id, c.id)).get()).toBeDefined();
	expect(audits()).toEqual(['list.archive']);
});

test('archived list is hidden from the page and the picker, shown on request, restorable', async () => {
	const l = newList(tenantA, 'Staff');
	newList(tenantA, 'Other');
	await useList(l.id, tenantA);
	await run('delete', superadmin, tenantA, l.id);

	expect(await names()).toEqual(['Other']);
	expect((await names('http://x/lists?archived=1')).sort()).toEqual(['Other', 'Staff']);
	const picker = (await pickerLoad(
		ctx(superadmin, tenantA) as unknown as Parameters<typeof pickerLoad>[0]
	)) as { lists: { name: string }[] };
	expect(picker.lists.map((x) => x.name)).toEqual(['Other']);

	expect((await run('restore', superadmin, tenantA, l.id)).restored).toBe(true);
	expect((await names()).sort()).toEqual(['Other', 'Staff']);
	expect(audits()).toEqual(['list.archive', 'list.restore']);
});

test('creating a campaign on an archived list is refused', async () => {
	const l = newList(tenantA, 'Staff');
	await useList(l.id, tenantA);
	await run('delete', superadmin, tenantA, l.id);
	await expect(useList(l.id, tenantA)).rejects.toThrow(/archiv/);
});

test('cross-tenant and unauthorized access is refused', async () => {
	const l = newList(tenantB, 'B list');
	expect(((await run('delete', superadmin, tenantA, l.id)) as { status: number }).status).toBe(404);
	expect(((await run('restore', superadmin, tenantA, l.id)) as { status: number }).status).toBe(
		404
	);
	await expect(runDetail('deleteList', superadmin, tenantA, l.id)).rejects.toMatchObject({
		status: 404
	});
	// operator not linked to the client: the active client is not resolved, nothing is touched
	await expect(run('delete', operator, tenantA, l.id)).rejects.toMatchObject({
		status: expect.any(Number)
	});
	expect(db.select().from(targetLists).all()).toHaveLength(1);
});

test('rename updates the list, audited; email-like names warn but are accepted', async () => {
	const l = newList(tenantA, 'old');
	expect(await runDetail('rename', superadmin, tenantA, l.id, { name: ' Comptabilité ' })).toEqual({
		renamed: true
	});
	expect(db.select().from(targetLists).get()?.name).toBe('Comptabilité');
	const r = await runDetail('rename', superadmin, tenantA, l.id, { name: 'a@b.ch' });
	expect(r.warning).toBeTruthy();
	expect(db.select().from(targetLists).get()?.name).toBe('a@b.ch');
	const empty = (await runDetail('rename', superadmin, tenantA, l.id, { name: ' ' })) as {
		status: number;
	};
	expect(empty.status).toBe(400);
	expect(audits()).toEqual(['list.rename', 'list.rename']);
});

test('rename of another tenant list is refused', async () => {
	const l = newList(tenantB, 'B');
	await expect(runDetail('rename', superadmin, tenantA, l.id, { name: 'x' })).rejects.toMatchObject(
		{ status: 404 }
	);
});

test('detail delete redirects to the list page', async () => {
	const l = newList(tenantA, 'x');
	await expect(runDetail('deleteList', superadmin, tenantA, l.id)).rejects.toMatchObject({
		status: 303,
		location: '/lists'
	});
	expect(db.select().from(targetLists).all()).toEqual([]);
});

test('creating a list named like an e-mail warns but succeeds', async () => {
	const r = (await actions.default(ctx(superadmin, tenantA, { name: 'x@y.ch' }) as never)) as {
		success: boolean;
		warning?: string;
	};
	expect(r.success).toBe(true);
	expect(r.warning).toBeTruthy();
});

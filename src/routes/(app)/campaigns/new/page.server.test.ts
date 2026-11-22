import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('$lib/server/db', async () => {
	const { createTestDb } = await import('$lib/server/db/test-db');
	return { db: createTestDb() };
});

import { db } from '$lib/server/db';
import {
	authorizations,
	campaigns,
	scenarios,
	sendingProfiles,
	targetLists,
	targets,
	tenants
} from '$lib/server/db/schema';
import type { User } from '$lib/server/db/schema';
import { addTarget, createList } from '$lib/server/targets';
import { createTenant } from '$lib/server/tenant';
import { readFileSync } from 'node:fs';
import { actions, load } from './+page.server';

const superadmin = { id: 'a1', email: 'admin@example.test', role: 'superadmin' } as unknown as User;

let tenantId: string;

beforeEach(async () => {
	db.delete(authorizations).run();
	db.delete(campaigns).run();
	db.delete(sendingProfiles).run();
	db.delete(targets).run();
	db.delete(targetLists).run();
	db.delete(tenants).run();
	tenantId = (await createTenant({ name: 'A' })).id;
});

test('load exposes the target count of each list', async () => {
	const full = await createList(tenantId, 'Pleine');
	const empty = await createList(tenantId, 'Vide');
	await addTarget(full.id, tenantId, { email: 'a@a.ch' });
	await addTarget(full.id, tenantId, { email: 'b@a.ch' });
	const data = (await load({
		locals: { user: superadmin },
		cookies: { get: () => tenantId, delete: () => {}, set: () => {} }
	} as unknown as Parameters<typeof load>[0])) as { lists: { id: string; targetCount: number }[] };
	const count = (id: string) => data.lists.find((l) => l.id === id)?.targetCount;
	expect(count(full.id)).toBe(2);
	expect(count(empty.id)).toBe(0);
});

const goodAuth = {
	reference: 'REF-1',
	approvedBy: 'Alice',
	validFrom: '2027-02-23T16:00',
	validUntil: '2027-03-23T16:00'
};

async function submit(overrides: Record<string, string> = {}) {
	const sc = db.select().from(scenarios).get()!;
	const sp = db.select().from(sendingProfiles).get()!;
	const tl = db.select().from(targetLists).get()!;
	const fields: Record<string, string> = {
		name: 'C',
		scenarioId: sc.id,
		sendingProfileId: sp.id,
		targetListId: tl.id,
		trackingDomain: 't.example.test',
		...goodAuth,
		...overrides
	};
	const body = new URLSearchParams(fields);
	return actions.default({
		request: new Request('http://localhost', { method: 'POST', body }),
		locals: { user: superadmin },
		cookies: { get: () => tenantId, delete: () => {}, set: () => {} }
	} as unknown as Parameters<typeof actions.default>[0]);
}

describe('create action: authorization errors', () => {
	beforeEach(() => {
		db.delete(campaigns).run();
		db.delete(sendingProfiles).run();
		db.delete(scenarios).run();
		db.insert(scenarios)
			.values({
				key: 's1',
				title: 'S',
				category: 'payment-fraud',
				locale: 'fr',
				difficulty: 'easy',
				tagsJson: '["t"]',
				path: '/s'
			})
			.run();
		db.insert(sendingProfiles)
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
			.run();
		db.insert(targetLists).values({ tenantId, name: 'l' }).run();
	});

	const cases: [string, Record<string, string>, string][] = [
		['missing reference', { reference: '' }, "Référence d'autorisation requise."],
		['missing approver', { approvedBy: '' }, "Nom de l'approbateur requis."],
		['missing start', { validFrom: '' }, 'Date de début requise.'],
		['invalid start', { validFrom: '32027-02-23T16:00' }, 'Date de début invalide.'],
		['missing end', { validUntil: '' }, 'Date de fin requise.'],
		['invalid end', { validUntil: '32027-02-23T16:00' }, 'Date de fin invalide.'],
		[
			'end before start',
			{ validUntil: '2027-02-23T16:00' },
			'La date de fin doit être après la date de début.'
		]
	];
	for (const [label, overrides, error] of cases)
		test(label, async () => {
			expect(await submit(overrides)).toMatchObject({ status: 400, data: { error } });
			expect(db.select().from(campaigns).all()).toHaveLength(0);
		});

	test('valid authorization creates the campaign', async () => {
		await expect(submit()).rejects.toMatchObject({ status: 303 });
		expect(db.select().from(campaigns).all()).toHaveLength(1);
	});
});

test('date inputs are bounded to a four-figure year', () => {
	for (const f of [
		'src/lib/components/campaigns/AuthorizationFields.svelte',
		'src/routes/(app)/campaigns/[id]/+page.svelte'
	]) {
		const src = readFileSync(f, 'utf8');
		const n = src.match(/type="datetime-local"/g)?.length ?? 0;
		expect(n).toBeGreaterThanOrEqual(2);
		expect(src.match(/max=\{DATETIME_MAX\}/g)).toHaveLength(n);
		expect(src.match(/min=\{DATETIME_MIN\}/g)).toHaveLength(n);
	}
});

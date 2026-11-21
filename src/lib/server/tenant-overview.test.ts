import { beforeEach, expect, test, vi } from 'vitest';

vi.mock('$lib/server/db', async () => {
	const { createTestDb } = await import('./db/test-db');
	return { db: createTestDb() };
});

import { db } from '$lib/server/db';
import {
	campaigns,
	scenarios,
	sendingProfiles,
	targetLists,
	targets,
	tenants,
	userTenants,
	users
} from '$lib/server/db/schema';
import type { Tenant, User } from '$lib/server/db/schema';
import { createUser } from './auth';
import { createTenant } from './tenant';
import { tenantOverviews } from './tenant-overview';

let operator: User;
let admin: User;
let a: Tenant;
let b: Tenant;

function seed(t: Tenant, label: string, recipients: number) {
	const list = db
		.insert(targetLists)
		.values({ tenantId: t.id, name: `L-${label}` })
		.returning()
		.get();
	for (let i = 0; i < recipients; i++) {
		db.insert(targets)
			.values({
				listId: list.id,
				tenantId: t.id,
				firstName: 'F',
				lastName: 'L',
				email: `${label}${i}@example.test`
			})
			.run();
	}
	const profile = db
		.insert(sendingProfiles)
		.values({
			tenantId: t.id,
			name: `P-${label}`,
			host: 'h',
			port: 25,
			username: 'u',
			passwordEnc: 'x',
			fromName: 'n',
			fromAddress: `${label}@example.test`
		})
		.returning()
		.get();
	const scenario = db
		.insert(scenarios)
		.values({
			key: `s-${label}`,
			title: 's',
			category: 'c',
			locale: 'fr',
			difficulty: 'easy',
			path: 'p'
		})
		.returning()
		.get();
	db.insert(campaigns)
		.values({
			tenantId: t.id,
			name: `C-${label}`,
			scenarioId: scenario.id,
			sendingProfileId: profile.id,
			targetListId: list.id,
			trackingDomain: 'x.test'
		})
		.run();
}

beforeEach(async () => {
	db.delete(campaigns).run();
	db.delete(targets).run();
	db.delete(targetLists).run();
	db.delete(sendingProfiles).run();
	db.delete(scenarios).run();
	db.delete(userTenants).run();
	db.delete(tenants).run();
	db.delete(users).run();
	admin = await createUser('admin@example.test', 'pw-admin-123', 'superadmin');
	operator = await createUser('op@example.test', 'pw-op-12345', 'operator');
	a = await createTenant({ name: 'Alpha', linkUserId: operator.id });
	b = await createTenant({ name: 'Bravo' });
	seed(a, 'a', 2);
	seed(b, 'b', 5);
});

test('operator linked to A gets only A, with A-only figures', async () => {
	const res = await tenantOverviews(operator);
	expect(res.map((o) => o.id)).toEqual([a.id]);
	expect(res[0]).toMatchObject({
		name: 'Alpha',
		listCount: 1,
		recipientCount: 2,
		profileCount: 1,
		campaignCount: 1,
		lastClickRate: null
	});
	expect(res[0].lastCampaign?.name).toBe('C-a');
	expect(JSON.stringify(res)).not.toContain('Bravo');
	expect(JSON.stringify(res)).not.toContain('C-b');
});

test('superadmin sees both tenants with their own figures', async () => {
	const res = await tenantOverviews(admin);
	const byName = Object.fromEntries(res.map((o) => [o.name, o]));
	expect(byName.Alpha.recipientCount).toBe(2);
	expect(byName.Bravo.recipientCount).toBe(5);
});

test('a user linked to no tenant gets nothing', async () => {
	const nobody = await createUser('none@example.test', 'pw-none-1234', 'operator');
	expect(await tenantOverviews(nobody)).toEqual([]);
});

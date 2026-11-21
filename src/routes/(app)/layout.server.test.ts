import { load } from './+layout.server';
import type { User } from '$lib/server/db/schema';

vi.mock('$lib/server/active-tenant', () => ({
	resolveActiveTenant: async () => ({ tenants: [], activeTenant: null })
}));

test('layout data exposes only an allowlist of user fields', async () => {
	const user = {
		id: 'u1',
		email: 'a@example.test',
		role: 'operator',
		passwordHash: '$argon2id$secret',
		createdAt: new Date()
	} as User;
	const cookies = { get: () => undefined, delete: () => {} };
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const data: any = await (load as any)({ locals: { user }, cookies });
	expect(data.user).toEqual({ id: 'u1', email: 'a@example.test', role: 'operator' });
	expect(JSON.stringify(data)).not.toMatch(/passwordHash|argon2id|secret/);
});

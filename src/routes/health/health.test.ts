import { GET } from './+server';

test('health returns ok', async () => {
	const res = await GET();
	expect(res.status).toBe(200);
	expect(await res.json()).toEqual({ status: 'ok' });
});

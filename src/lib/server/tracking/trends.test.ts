import { expect, test, vi } from 'vitest';

vi.mock('$lib/server/db', async () => {
	const { createTestDb } = await import('../db/test-db');
	return { db: createTestDb() };
});

import { toTrendPoint } from './trends';
import type { Funnel } from './stats';

const funnel = (sent: number, clicked: number, submitted: number, reported: number): Funnel => {
	const human = {
		opened: 0,
		clicked,
		pageInteraction: 0,
		formSubmitted: submitted,
		awarenessViewed: 0,
		reported
	};
	return { recipients: sent, sent, failed: 0, ...human, clicked: clicked + 5, human };
};

test('taux humains sur les envois (scanners exclus)', () => {
	const p = toTrendPoint({ id: 'c', name: 'N', createdAt: new Date(0) }, funnel(10, 3, 1, 2));
	expect(p).toMatchObject({ sent: 10, clickRate: 0.3, submitRate: 0.1, reportRate: 0.2 });
});

test('campagne sans envoi ignorée', () => {
	expect(
		toTrendPoint({ id: 'c', name: 'N', createdAt: new Date(0) }, funnel(0, 0, 0, 0))
	).toBeNull();
});

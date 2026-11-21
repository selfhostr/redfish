import { beforeEach, expect, test, vi } from 'vitest';

vi.mock('$lib/server/db', async () => {
	const { createTestDb } = await import('../db/test-db');
	return { db: createTestDb() };
});

import { db } from '$lib/server/db';
import { jobs, workerHeartbeat } from '$lib/server/db/schema';
import { FAILED_WINDOW_MS, getQueueHealth, recordHeartbeat, WORKER_STALE_MS } from './health';

const now = new Date('2026-01-01T12:00:00Z');
const job = (status: 'queued' | 'retry' | 'failed' | 'done', runAt: Date) =>
	db.insert(jobs).values({ type: 't', payloadJson: 'null', runAt, status }).run();

beforeEach(() => {
	db.delete(jobs).run();
	db.delete(workerHeartbeat).run();
});

test('no heartbeat ever: worker down', () => {
	const h = getQueueHealth(now);
	expect(h).toMatchObject({ failedJobs: 0, oldestDueAgeMs: null, lastHeartbeat: null });
	expect(h.workerDown).toBe(true);
	expect(h.needsAttention).toBe(true);
});

test('recent heartbeat, empty queue: healthy; heartbeat upserts', () => {
	recordHeartbeat(new Date(now.getTime() - 60_000));
	recordHeartbeat(new Date(now.getTime() - 10_000));
	expect(db.select().from(workerHeartbeat).all()).toHaveLength(1);
	const h = getQueueHealth(now);
	expect(h.lastHeartbeat?.getTime()).toBe(now.getTime() - 10_000);
	expect(h.workerDown).toBe(false);
	expect(h.needsAttention).toBe(false);
});

test('stale heartbeat flags the worker as down', () => {
	recordHeartbeat(new Date(now.getTime() - WORKER_STALE_MS - 2000));
	expect(getQueueHealth(now).workerDown).toBe(true);
});

test('counts failed jobs and ages the oldest due unprocessed job', () => {
	recordHeartbeat(now);
	job('failed', new Date(now.getTime() - 1000));
	job('queued', new Date(now.getTime() - 120_000));
	job('retry', new Date(now.getTime() - 30_000));
	job('queued', new Date(now.getTime() + 60_000)); // pas encore dû
	job('done', new Date(now.getTime() - 900_000)); // traité
	const h = getQueueHealth(now);
	expect(h.failedJobs).toBe(1);
	expect(h.oldestDueAgeMs).toBe(120_000);
	expect(h.needsAttention).toBe(true);
});

test('ignore les échecs plus anciens que la fenêtre de 24 h', () => {
	recordHeartbeat(now);
	job('failed', new Date(now.getTime() - FAILED_WINDOW_MS - 1000));
	const h = getQueueHealth(now);
	expect(h.failedJobs).toBe(0);
	expect(h.needsAttention).toBe(false);
	job('failed', new Date(now.getTime() - FAILED_WINDOW_MS + 1000));
	expect(getQueueHealth(now).failedJobs).toBe(1);
});

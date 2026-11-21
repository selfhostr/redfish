import { beforeEach, expect, test, vi } from 'vitest';

vi.mock('$lib/server/db', async () => {
	const { createTestDb } = await import('../db/test-db');
	return { db: createTestDb() };
});

import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { jobs } from '$lib/server/db/schema';
import {
	BASE_MS,
	claimDueJobs,
	enqueue,
	LEASE_MS,
	MAX_ATTEMPTS,
	registerHandler,
	runDueJobs
} from './queue';

const get = (id: string) => db.select().from(jobs).where(eq(jobs.id, id)).get()!;

beforeEach(() => {
	db.delete(jobs).run();
});

test('a queued job runs its handler once and becomes done', async () => {
	const fn = vi.fn(async () => {});
	registerHandler('ok', fn);
	const job = await enqueue('ok', { a: 1 });
	const now = new Date(Date.now() + 1000);
	expect(await runDueJobs(now)).toEqual({ ran: 1, failed: 0 });
	expect(await runDueJobs(now)).toEqual({ ran: 0, failed: 0 });
	expect(fn).toHaveBeenCalledTimes(1);
	expect(fn).toHaveBeenCalledWith({ a: 1 });
	expect(get(job.id).status).toBe('done');
});

test('a future job is not run yet', async () => {
	registerHandler('later', async () => {});
	const job = await enqueue('later', {}, new Date(Date.now() + 3_600_000));
	expect((await runDueJobs()).ran).toBe(0);
	expect(get(job.id).status).toBe('queued');
});

test('a throwing handler retries with backoff, then fails after MAX_ATTEMPTS', async () => {
	registerHandler('boom', async () => {
		throw new Error('nope');
	});
	const job = await enqueue('boom', {});
	let now = new Date(Date.now() + 1000);
	for (let i = 1; i < MAX_ATTEMPTS; i++) {
		const r = await runDueJobs(now);
		expect(r.failed).toBe(1);
		const row = get(job.id);
		expect(row.attempts).toBe(i);
		expect(row.status).toBe('retry');
		const delay = row.runAt.getTime() - now.getTime();
		expect(Math.abs(delay - 2 ** i * BASE_MS)).toBeLessThanOrEqual(1000);
		now = new Date(row.runAt.getTime() + 1000);
	}
	await runDueJobs(now);
	const row = get(job.id);
	expect(row.attempts).toBe(MAX_ATTEMPTS);
	expect(row.status).toBe('failed');
});

test('a leased job is not re-claimed within the lease, but is after it expires', async () => {
	registerHandler('x', async () => {});
	const job = await enqueue('x', {});
	const now = new Date(Date.now() + 1000);
	expect(claimDueJobs(10, now).map((j) => j.id)).toEqual([job.id]);
	expect(get(job.id).status).toBe('running');
	expect(claimDueJobs(10, now)).toEqual([]);
	expect(claimDueJobs(10, new Date(now.getTime() + LEASE_MS + 2000)).length).toBe(1);
});

test('a job without handler is never claimed and does not starve handled jobs', async () => {
	registerHandler('handled', async () => {});
	const past = new Date(Date.now() - 3_600_000);
	for (let i = 0; i < 12; i++) await enqueue('no-handler', {}, past);
	const ok = await enqueue('handled', {});
	const r = await runDueJobs(new Date(Date.now() + 1000));
	expect(r).toEqual({ ran: 1, failed: 0 });
	expect(get(ok.id).status).toBe('done');
	expect(db.select().from(jobs).where(eq(jobs.status, 'queued')).all().length).toBe(12);
});

test('reclaiming an expired lease counts an attempt and ends failed at MAX_ATTEMPTS', async () => {
	const fn = vi.fn(async () => {});
	registerHandler('crash', fn);
	const job = await enqueue('crash', {});
	let now = new Date(Date.now() + 1000);
	for (let i = 1; i <= MAX_ATTEMPTS; i++) {
		expect(claimDueJobs(10, now).length).toBe(1);
		expect(get(job.id).attempts).toBe(i - 1);
		now = new Date(now.getTime() + LEASE_MS + 2000);
	}
	expect(claimDueJobs(10, now)).toEqual([]);
	const row = get(job.id);
	expect(row.status).toBe('failed');
	expect(row.attempts).toBe(MAX_ATTEMPTS);
	expect(fn).not.toHaveBeenCalled();
});

test('a stale worker cannot overwrite a job reclaimed by another', async () => {
	let release!: () => void;
	registerHandler('slow', () => new Promise<void>((r) => (release = r)));
	const job = await enqueue('slow', {});
	const t0 = new Date(Date.now() + 1000);
	const slow = runDueJobs(t0);
	// bail expiré : un second worker reprend le job
	const t1 = new Date(t0.getTime() + LEASE_MS + 2000);
	expect(claimDueJobs(10, t1).length).toBe(1);
	release();
	await slow;
	const row = get(job.id);
	expect(row.status).toBe('running');
	expect(row.lockedAt!.getTime()).toBe(Math.floor(t1.getTime() / 1000) * 1000);
});

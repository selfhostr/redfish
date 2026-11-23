import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('$lib/server/env', () => ({ validateEnv: vi.fn() }));
vi.mock('$lib/server/auth', () => ({
	SESSION_COOKIE: 'sid',
	hashToken: (t: string) => t,
	validateSession: vi.fn(async () => null)
}));

import { handle } from './hooks.server';

const PAGE = '<html><head></head><body><script>beacon()</script></body></html>';

async function run(url: string, html = PAGE) {
	const event = {
		url: new URL(url),
		cookies: { get: () => undefined, delete: () => {} },
		locals: {}
	};
	const resolve = vi.fn(async (_e: unknown, opts?: any) => {
		const body = opts?.transformPageChunk ? opts.transformPageChunk({ html, done: true }) : html;
		return new Response(body, { headers: { 'content-type': 'text/html' } });
	});
	const res = await handle({ event, resolve } as any);
	return { res, resolve };
}

beforeEach(() => {
	vi.unstubAllEnvs();
	vi.stubEnv('DASHBOARD_HOST', 'dash.example.org');
	vi.stubEnv('TRACKING_HOST', 'go.example.net');
});

describe('isolation des hôtes', () => {
	test('/t/.. sur l’hôte dashboard => 404', async () => {
		const { res, resolve } = await run('https://dash.example.org/t/p/abc');
		expect(res.status).toBe(404);
		expect(resolve).not.toHaveBeenCalled();
	});
	test('(app) sur l’hôte tracking => 404', async () => {
		const { res } = await run('https://go.example.net/campaigns');
		expect(res.status).toBe(404);
	});
	test('chaque hôte sert sa partie', async () => {
		expect((await run('https://go.example.net/t/p/abc')).res.status).toBe(200);
		expect((await run('https://dash.example.org/campaigns')).res.status).toBe(200);
	});
	test('variables absentes (dev) => les deux autorisés', async () => {
		vi.stubEnv('DASHBOARD_HOST', '');
		vi.stubEnv('TRACKING_HOST', '');
		expect((await run('http://localhost:5173/t/p/abc')).res.status).toBe(200);
		expect((await run('http://localhost:5173/campaigns')).res.status).toBe(200);
	});
});

describe('CSP', () => {
	test('stricte, sans unsafe-inline pour les scripts, nonce sur le beacon', async () => {
		const { res } = await run('https://go.example.net/t/p/abc');
		const csp = res.headers.get('content-security-policy')!;
		expect(csp).toContain("default-src 'self'");
		const script = csp
			.split(';')
			.map((s: string) => s.trim())
			.find((s: string) => s.startsWith('script-src'))!;
		expect(script).not.toContain('unsafe-inline');
		expect(script).not.toContain('unsafe-eval');
		expect(csp).not.toMatch(/https?:\/\//);
		expect(csp).toContain("frame-ancestors 'none'");
		const nonce = /'nonce-([^']+)'/.exec(script)![1];
		const body = await res.text();
		expect(body).toContain(`<script nonce="${nonce}">beacon()</script>`);
	});
	test('nonce différent à chaque réponse', async () => {
		const a = (await run('https://go.example.net/t/p/a')).res.headers.get(
			'content-security-policy'
		);
		const b = (await run('https://go.example.net/t/p/a')).res.headers.get(
			'content-security-policy'
		);
		expect(a).not.toBe(b);
	});
	test('CSP aussi sur les 404 d’isolation', async () => {
		const { res } = await run('https://dash.example.org/t/p/abc');
		expect(res.headers.get('content-security-policy')).toContain("default-src 'self'");
	});
});

describe('en-têtes de sécurité', () => {
	const expectHeaders = (res: Response) => {
		expect(res.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
		expect(res.headers.get('x-content-type-options')).toBe('nosniff');
	};
	test('réponse normale', async () => {
		expectHeaders((await run('https://go.example.net/t/p/abc')).res);
	});
	test('404 d’hôte inconnu', async () => {
		const { res } = await run('https://dash.example.org/t/p/abc');
		expect(res.status).toBe(404);
		expectHeaders(res);
	});
});

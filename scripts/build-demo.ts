/**
 * Builds the static demo (`npm run build:demo [-- --out <dir>]`): the real pages, served under
 * /demo with no server at all. Default output: build-demo/.
 *
 * 1. A throwaway database is seeded with the fictional data of scripts/seed-screenshots.ts.
 * 2. The app runs on it (vite dev, on a free local port) and every page reachable from the menu is
 *    recorded as SvelteKit serves it to the browser (`__data.json`), for each client in turn, with
 *    the downloadable exports, the editor preview of the neutral skeletons and the 2FA enrolment.
 * 3. `vite build --mode demo` builds the client-only app (src/lib/demo/install.ts replays the
 *    recordings), then the recordings are written next to it under _demo/.
 *
 * Nothing secret ends up in the output: throwaway key, throwaway database, fictional accounts.
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import * as devalue from 'devalue';
import type { DemoManifest } from '../src/lib/demo/install';
import { pageKey } from '../src/lib/demo/paths';

const BASE = '/demo';
const OUT = 'build-demo';
const ADMIN = 'admin@demo.example';
const PASSWORD = 'screenshots-demo-1234';
/** The client the demo opens on (the richest one of the seed). */
const MAIN_TENANT = 'Fiduciaire Démo Lémanique SA';
/** Throwaway key for the throwaway database (never a production value). */
const KEY = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff';
const MAX_PAGES_PER_CLIENT = 400;
/** Entry points; every other page is found by following the links. */
const SEEDS = [
	'/',
	'/dashboard',
	'/campaigns',
	'/campaigns/new',
	'/lists',
	'/sending-profiles',
	'/tenants',
	'/scenarios',
	'/scenarios/new',
	'/users',
	'/audit',
	'/account',
	'/privacy'
];
/** Never followed: leaving the session, public tracking, health check. */
const SKIP = /^\/(logout|t\/|health)/;
const DOWNLOAD = /\/(export|pdf)$/;

const argOut = process.argv.indexOf('--out');
const copyTo = argOut > 0 ? resolve(process.argv[argOut + 1]) : null;

const tmp = mkdtempSync(join(tmpdir(), 'redfish-demo-'));
const env = {
	...process.env,
	DATABASE_URL: `file:${join(tmp, 'demo.db')}`,
	REDFISH_SECRET_KEY: KEY,
	DASHBOARD_HOST: '',
	TRACKING_HOST: ''
};

function run(cmd: string, args: string[]) {
	const r = spawnSync(cmd, args, { stdio: 'inherit', env });
	if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed`);
}

function freePort(): Promise<number> {
	return new Promise((ok, ko) => {
		const s = createServer();
		s.listen(0, '127.0.0.1', () => {
			const port = (s.address() as { port: number }).port;
			s.close(() => ok(port));
		});
		s.on('error', ko);
	});
}

// ---- Recording ------------------------------------------------------------------------------

const files = new Map<string, string>(); // name -> content
const downloads = new Map<string, Buffer>(); // path -> content
const fetched = new Set<string>();
const manifest: DemoManifest = { tenant: null, pages: {}, actions: {}, preview: null };

function store(content: string): string {
	const name = createHash('sha256').update(content).digest('hex').slice(0, 16) + '.json';
	files.set(name, content);
	return name;
}

const decode = (s: string) =>
	s
		.replace(/&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>');

class Session {
	cookies = new Map<string, string>();
	constructor(readonly origin: string) {}

	async fetch(path: string, init: RequestInit = {}): Promise<Response> {
		const headers = new Headers(init.headers);
		headers.set('cookie', [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; '));
		headers.set('origin', this.origin);
		headers.set('user-agent', 'Mozilla/5.0 (X11; Linux x86_64) redfish-demo');
		const res = await fetch(this.origin + path, { ...init, headers, redirect: 'manual' });
		for (const c of res.headers.getSetCookie()) {
			const [pair] = c.split(';');
			const i = pair.indexOf('=');
			this.cookies.set(pair.slice(0, i), pair.slice(i + 1));
		}
		return res;
	}

	post(path: string, fields: Record<string, string>, headers: Record<string, string> = {}) {
		return this.fetch(path, {
			method: 'POST',
			body: new URLSearchParams(fields),
			headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers }
		});
	}

	/** The `__data.json` of a page, with redirects rebased under the demo's base path. */
	async data(key: string): Promise<string | null> {
		const url = new URL(key, 'http://x');
		const path = (url.pathname === '/' ? '' : url.pathname) + '/__data.json' + url.search;
		const res = await this.fetch(path);
		if (!res.ok) return null;
		const lines = (await res.text()).split('\n').filter(Boolean);
		const first = JSON.parse(lines[0]);
		if (first.type === 'redirect') {
			if (String(first.location).startsWith('/login')) throw new Error(`${key}: not signed in`);
			if (String(first.location).startsWith('/')) first.location = BASE + first.location;
			lines[0] = JSON.stringify(first);
		}
		return lines.join('\n') + '\n';
	}

	/** The objects returned by the server loads of a page, in layout order. */
	async loads(key: string): Promise<Record<string, unknown>[]> {
		const text = await this.data(key);
		const first = JSON.parse((text ?? '').split('\n')[0] || '{}');
		return ((first.nodes ?? []) as { type: string; data: unknown }[])
			.filter((n) => n?.type === 'data')
			.map((n) => devalue.unflatten(n.data as never) as Record<string, unknown>);
	}
}

/** Every page reachable from the entry points for the active client, and the exports. */
async function crawl(s: Session): Promise<Record<string, string>> {
	const pages: Record<string, string> = {};
	const queue = [...SEEDS];
	const seen = new Set(queue);
	while (queue.length && Object.keys(pages).length < MAX_PAGES_PER_CLIENT) {
		const key = queue.shift()!;
		const data = await s.data(key);
		if (!data) continue;
		pages[key] = store(data);
		if (JSON.parse(data.split('\n')[0]).type === 'redirect') continue;
		const html = await (await s.fetch(key)).text();
		for (const [tag] of html.matchAll(/<a\b[^>]*>/g)) {
			const href = /\shref="([^"]*)"/.exec(tag)?.[1];
			if (!href || /^(\w+:|\/\/|#)/.test(href)) continue;
			const link = new URL(decode(href), `http://x${key}`);
			const next = pageKey(link.pathname, link.searchParams);
			const path = link.pathname;
			if (SKIP.test(path)) continue;
			if (/\sdownload[\s=>]/.test(tag) || DOWNLOAD.test(path)) {
				if (!fetched.has(path)) {
					fetched.add(path);
					const res = await s.fetch(next);
					// An HTML page (the printable report) is served from <path>.html by static hosts.
					const html = res.headers.get('content-type')?.startsWith('text/html');
					if (res.ok)
						downloads.set(html ? `${path}.html` : path, Buffer.from(await res.arrayBuffer()));
				}
				continue;
			}
			if (!seen.has(next)) {
				seen.add(next);
				queue.push(next);
			}
		}
	}
	return pages;
}

async function record(origin: string) {
	const s = new Session(origin);
	const login = await s.post('/login', { email: ADMIN, password: PASSWORD });
	const signedIn = login.status === 303 || (await login.text()).includes('"redirect"');
	if (!signedIn) throw new Error(`sign-in failed (${login.status})`);

	const layout = (await s.loads('/dashboard')).find((d) => 'tenants' in d) as {
		tenants: { id: string; name: string }[];
	};
	const main = layout.tenants.find((t) => t.name === MAIN_TENANT) ?? layout.tenants[0];
	const order = [...layout.tenants.filter((t) => t !== main), main];
	for (const t of order) {
		const sw = await s.post('/set-tenant', { tenantId: t.id, redirectTo: '/dashboard' });
		if (sw.status !== 303) throw new Error(`switching to ${t.name} failed (${sw.status})`);
		manifest.pages[t.id] = await crawl(s);
		console.log(`recorded ${Object.keys(manifest.pages[t.id]).length} pages for ${t.name}`);
	}
	manifest.tenant = main.id;

	// The editor preview of the neutral skeletons (the values the editor opens with).
	const editor = (await s.loads('/scenarios/new')).find((d) => 'defaults' in d) as {
		defaults: Record<string, string>;
	};
	const request = Object.fromEntries(
		Object.entries(editor.defaults).map(([k, v]) => [k, String(v ?? '')])
	);
	const body = new FormData();
	for (const [k, v] of Object.entries(request)) body.set(k, v);
	const pv = await s.fetch('/scenarios/new/preview', { method: 'POST', body });
	if (!pv.ok) throw new Error(`preview failed (${pv.status})`);
	manifest.preview = { request, file: store(await pv.text()) };

	// Enabling 2FA: the reply, then the account page showing the QR code (last: it changes state).
	const totp = await s.post('/account?/totpStart', {}, { 'x-sveltekit-action': 'true' });
	if (!totp.ok) throw new Error(`totpStart failed (${totp.status})`);
	const reply = await totp.json();
	if (String(reply.location ?? '').startsWith('/')) reply.location = BASE + reply.location;
	manifest.actions['/account?/totpStart'] = {
		file: store(JSON.stringify(reply)),
		after: { '/account': store((await s.data('/account'))!) }
	};
}

// ---- Build ----------------------------------------------------------------------------------

function writeOutput() {
	const index = join(OUT, 'index.html');
	let html = readFileSync(index, 'utf8');
	// The bootstrap script becomes a file: the demo's CSP allows no inline script.
	const m = /<script[^>]*>([\s\S]*?)<\/script>/.exec(html);
	if (!m) throw new Error('bootstrap script not found in index.html');
	const boot = m[1].trim() + '\n';
	const bootName = `_app/boot.${createHash('sha256').update(boot).digest('hex').slice(0, 8)}.js`;
	writeFileSync(join(OUT, bootName), boot);
	html = html.replace(m[0], `<script src="${BASE}/${bootName}"></script>`);
	if (/<script(?![^>]*\ssrc=)/.test(html)) throw new Error('inline script left in index.html');
	writeFileSync(index, html);
	// The same shell for every recorded page (static hosts serve /x from x.html) and for 404s.
	writeFileSync(join(OUT, '404.html'), html);
	const paths = new Set(
		Object.values(manifest.pages).flatMap((p) => Object.keys(p).map((k) => k.split('?')[0]))
	);
	for (const p of paths) {
		if (p === '/') continue;
		const target = join(OUT, `${p.slice(1)}.html`);
		mkdirSync(dirname(target), { recursive: true });
		writeFileSync(target, html);
	}
	for (const [p, content] of downloads) {
		mkdirSync(dirname(join(OUT, p)), { recursive: true });
		writeFileSync(join(OUT, p.slice(1)), content);
	}
	mkdirSync(join(OUT, '_demo'), { recursive: true });
	for (const [name, content] of files) {
		if (content.includes(KEY) || content.includes('$argon2')) {
			throw new Error(`${name}: a secret would be published`);
		}
		writeFileSync(join(OUT, '_demo', name), content);
	}
	writeFileSync(join(OUT, '_demo', 'manifest.json'), JSON.stringify(manifest));
}

let server: ChildProcess | null = null;
try {
	run('npx', ['svelte-kit', 'sync']);
	run('npm', ['run', '--silent', 'db:migrate']);
	run('npm', ['run', '--silent', 'db:seed:screenshots']);
	// A live worker, as in a running install (no worker runs here: nothing is ever sent).
	run('npx', [
		'tsx',
		'--eval',
		"import { recordHeartbeat } from './src/lib/server/jobs/health'; recordHeartbeat();"
	]);
	const port = await freePort();
	const origin = `http://127.0.0.1:${port}`;
	server = spawn(
		'npx',
		['vite', 'dev', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
		{
			env,
			stdio: ['ignore', 'ignore', 'inherit'],
			detached: true
		}
	);
	const deadline = Date.now() + 120_000;
	for (;;) {
		const ok = await fetch(`${origin}/health`).then(
			(r) => r.ok,
			() => false
		);
		if (ok) break;
		if (Date.now() > deadline) throw new Error('the app did not start');
		await new Promise((r) => setTimeout(r, 500));
	}
	await record(origin);
	process.kill(-server.pid!, 'SIGTERM');
	server = null;

	rmSync(OUT, { recursive: true, force: true });
	run('npx', ['vite', 'build', '--mode', 'demo']);
	writeOutput();
	if (copyTo) {
		rmSync(copyTo, { recursive: true, force: true });
		cpSync(OUT, copyTo, { recursive: true });
	}
	console.log(`Static demo written to ${copyTo ?? resolve(OUT)} (serve it under ${BASE}/).`);
} finally {
	if (server?.pid) process.kill(-server.pid, 'SIGTERM');
	rmSync(tmp, { recursive: true, force: true });
}

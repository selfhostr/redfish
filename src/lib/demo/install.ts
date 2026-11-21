/**
 * The static demo: the real pages, with the server replaced in the visitor's browser. Loaded only by
 * the demo build (see src/hooks.client.ts); `npm run build:demo` (scripts/build-demo.ts) records the
 * data of every page from the fictional seed and writes it under `<base>/_demo/`.
 *
 * - Page data: the `__data.json` requests of SvelteKit are answered with the recorded responses of
 *   the active client (organisation). Switching the client works, in memory.
 * - Mutations: a POST form is stopped before it leaves the page, with a toast. The few actions that
 *   were recorded (enabling 2FA shows its QR code) replay their response and the page state after.
 * - The scenario editor preview replays the response recorded for the neutral skeletons.
 * - Links: pages write root-relative links (`/campaigns`); the base path is added to them here.
 *
 * Nothing leaves the page: another origin is refused, as a network failure would be, and the only
 * requests are to the demo's own static files. State lives in memory and is forgotten on reload.
 */
import { goto } from '$app/navigation';
import { mount } from 'svelte';
import { BASE_PATH } from '$lib/base-path';
import { toast } from '$lib/components/ui/toast.svelte';
import DemoBanner from './DemoBanner.svelte';
import { pageKey, rebaseHref, stripBase } from './paths';

/** Recorded data, as written by scripts/build-demo.ts. Values are file names under `_demo/`. */
export interface DemoManifest {
	/** The client active when the demo opens. */
	tenant: string | null;
	/** Page data per client id: `pathname[?query]` -> file. */
	pages: Record<string, Record<string, string>>;
	/** Recorded form actions: `pathname?/action` -> reply file, and page data after it. */
	actions: Record<string, { file: string; after: Record<string, string> }>;
	/** The editor preview, recorded for the form values `request`. */
	preview: { request: Record<string, string>; file: string } | null;
}

export const DISABLED = "Désactivé dans la démo : rien n'est enregistré ni envoyé.";
const NOT_FILTERED = 'Les filtres et la recherche ne sont pas simulés dans la démo.';
const PREVIEW_ONLY =
	"Aperçu précalculé dans la démo : les modifications du gabarit n'y sont pas rendues.";

const realFetch = window.fetch.bind(window);
let manifestPromise: Promise<DemoManifest> | null = null;
let tenant: string | null = null;
/** Page data replaced by a replayed action, until reload. */
const overlays = new Map<string, string>();
/** Keys (`pathname?/action`) of the recorded actions, which are let through. */
const recordedActions = new Set<string>();

function manifest(): Promise<DemoManifest> {
	manifestPromise ??= realFetch(`${BASE_PATH}/_demo/manifest.json`).then(async (r) => {
		const m = (await r.json()) as DemoManifest;
		tenant ??= m.tenant;
		return m;
	});
	return manifestPromise;
}

const file = (name: string) => realFetch(`${BASE_PATH}/_demo/${name}`);

function json(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' }
	});
}

const appPath = (pathname: string) => stripBase(pathname, BASE_PATH);

async function pageData(path: string, params: URLSearchParams): Promise<Response> {
	const m = await manifest();
	const pages = m.pages[tenant ?? ''] ?? m.pages[m.tenant ?? ''] ?? {};
	const key = pageKey(path, params);
	let name = overlays.get(key) ?? pages[key];
	if (!name && key !== path) {
		// A query that was not recorded (a search, a filter): the unfiltered page.
		name = overlays.get(path) ?? pages[path];
		const keys = [...new URL(key, location.origin).searchParams.keys()];
		if (name && keys.some((k) => k !== 'next')) toast(NOT_FILTERED, 'info');
	}
	if (!name) return json({ message: "Cette page n'existe pas dans la démo." }, 404);
	const res = await file(name);
	return new Response(res.body, { headers: { 'content-type': 'application/json' } });
}

async function action(key: string): Promise<Response> {
	const m = await manifest();
	const recorded = m.actions[key];
	if (!recorded) {
		toast(DISABLED, 'info');
		return json({ type: 'failure', status: 403, data: '[{}]' });
	}
	for (const [path, name] of Object.entries(recorded.after)) overlays.set(path, name);
	return file(recorded.file);
}

/** The editor preview: the recorded one, with the subject and sender typed by the visitor. */
async function preview(request: Request): Promise<Response> {
	const m = await manifest();
	if (!m.preview) return json({ message: 'Aperçu indisponible dans la démo.' }, 503);
	const form = await request.formData();
	// Multipart bodies carry CRLF line endings: compare the text, not the line endings.
	const value = (k: string) => String(form.get(k) ?? '').replace(/\r\n/g, '\n');
	const out = (await (await file(m.preview.file)).json()) as {
		preview: { subject: string; fromName: string; recipient: Record<string, string> };
		issues: { field: string; message: string }[];
	};
	const { recipient } = out.preview;
	out.preview.subject = value('subject').replace(
		/\{\{\s*(firstName|lastName|email)\s*\}\}/g,
		(_, k: string) => recipient[k] ?? ''
	);
	out.preview.fromName = value('fromName') || out.preview.fromName;
	for (const field of ['email', 'landing', 'awareness']) {
		if (value(field) !== (m.preview.request[field] ?? '').replace(/\r\n/g, '\n')) {
			out.issues.push({ field, message: PREVIEW_ONLY });
		}
	}
	return json(out);
}

function installFetch(): void {
	window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
		const request = input instanceof Request && !init ? input : new Request(input, init);
		const url = new URL(request.url);
		if (url.origin !== location.origin) {
			throw new TypeError('Network access is disabled in the demo');
		}
		// The app calls its endpoints at the root (`/scenarios/new/preview`).
		const path = appPath(url.pathname) ?? url.pathname;
		if (path.endsWith('/__data.json')) {
			return pageData(path.slice(0, -'/__data.json'.length) || '/', url.searchParams);
		}
		if (request.method === 'GET' || request.method === 'HEAD') {
			return realFetch(request);
		}
		if (path === '/scenarios/new/preview') return preview(request);
		if (request.headers.get('x-sveltekit-action')) return action(path + url.search);
		toast(DISABLED, 'info');
		return json({ message: DISABLED }, 403);
	};
}

/** Submitting a POST form: switching the client, a recorded action, or nothing (with a toast). */
function interceptForms(): void {
	window.addEventListener(
		'submit',
		(event) => {
			const form = event.target;
			if (!(form instanceof HTMLFormElement)) return;
			const submitter = event.submitter as HTMLButtonElement | HTMLInputElement | null;
			const method = (submitter?.getAttribute('formmethod') ?? form.method).toLowerCase();
			if (method !== 'post') return;
			const target = new URL(
				submitter?.getAttribute('formaction') ? submitter.formAction : form.action
			);
			const path = appPath(target.pathname) ?? target.pathname;
			// A recorded action goes on to `use:enhance`, then to `action()` above.
			if (recordedActions.has(path + target.search)) return;
			event.preventDefault();
			event.stopImmediatePropagation();
			if (path === '/set-tenant') {
				const data = new FormData(form, submitter);
				tenant = String(data.get('tenantId') ?? '') || tenant;
				const back = String(data.get('redirectTo') ?? '/');
				const local = back.startsWith('/') && !back.startsWith('//') ? back : '/';
				void goto(BASE_PATH + (appPath(local) ?? local), { invalidateAll: true });
				return;
			}
			toast(DISABLED, 'info');
		},
		true
	);
}

const LINK_ATTRS: Record<string, string> = {
	A: 'href',
	AREA: 'href',
	FORM: 'action',
	BUTTON: 'formaction',
	INPUT: 'formaction'
};

/** Adds the base path to a root-relative link, form action or button target. */
function rebase(el: Element): void {
	const name = LINK_ATTRS[el.tagName];
	if (!name) return;
	const v = el.getAttribute(name);
	if (!v) return;
	const rebased = rebaseHref(v, BASE_PATH);
	if (rebased !== v) el.setAttribute(name, rebased);
}

function rebaseLinks(): void {
	const selector = 'a[href], area[href], form[action], button[formaction], input[formaction]';
	const visit = (node: Node) => {
		if (!(node instanceof Element)) return;
		rebase(node);
		node.querySelectorAll(selector).forEach(rebase);
	};
	new MutationObserver((records) => {
		for (const r of records) {
			if (r.type === 'attributes') rebase(r.target as Element);
			else r.addedNodes.forEach(visit);
		}
	}).observe(document.documentElement, {
		subtree: true,
		childList: true,
		attributes: true,
		attributeFilter: ['href', 'action', 'formaction']
	});
	visit(document.documentElement);
}

export function install(): void {
	installFetch();
	interceptForms();
	rebaseLinks();
	void manifest().then((m) => Object.keys(m.actions).forEach((k) => recordedActions.add(k)));
	const host = document.createElement('div');
	document.body.prepend(host);
	mount(DemoBanner, { target: host });
}

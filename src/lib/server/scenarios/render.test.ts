import { afterAll, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// render.ts importe parseManifest depuis ./loader, qui importe la base de
// données : on la remplace par une base SQLite en mémoire (comme loader.test).
vi.mock('$lib/server/db', async () => {
	const { createTestDb } = await import('../db/test-db');
	return { db: createTestDb() };
});

import type { Scenario } from '$lib/server/db/schema';
import { makeScenarioRoot, writeScenarioPackage } from './fixtures';
import { getScenario, loadScenarios } from './loader';
import { renderAwareness, renderEmail, renderLanding, renderTemplate } from './render';
import type { RenderCtx } from './render';

/** Le dépôt ne livre plus de scénario : on charge un paquet FIXTURE sur disque. */
const FIXTURE_KEY = 'fixture-render';

const ctx: RenderCtx = {
	// Caractères spéciaux pour vérifier l'échappement HTML du texte.
	firstName: 'A<&>B',
	lastName: 'Durand',
	email: 'a.durand@exemple.test',
	awarenessMessage: 'Note propre à cette campagne.',
	urls: {
		open: 'https://track.exemple.test/o/AAAA-bbbb_CCCC',
		click: 'https://track.exemple.test/c/AAAA-bbbb_CCCC',
		submit: 'https://track.exemple.test/s/AAAA-bbbb_CCCC',
		beacon: 'https://track.exemple.test/b/AAAA-bbbb_CCCC',
		awareness: 'https://track.exemple.test/a/AAAA-bbbb_CCCC'
	}
};

let scenario: Scenario;
let root: string;

beforeAll(async () => {
	root = await makeScenarioRoot();
	await writeScenarioPackage(root, {
		key: FIXTURE_KEY,
		title: 'Fixture rendu',
		subject: 'Test de rendu {{firstName}}'
	});
});

afterAll(async () => {
	await rm(root, { recursive: true, force: true });
});

beforeEach(async () => {
	await loadScenarios(root);
	const s = getScenario(FIXTURE_KEY);
	expect(s).toBeDefined();
	scenario = s as Scenario;
});

test('renderTemplate échappe < et & et vide les clés inconnues', () => {
	expect(renderTemplate('x {{v}} y', { v: '<a & b>' })).toBe('x &lt;a &amp; b&gt; y');
	expect(renderTemplate('a{{manquant}}b', {})).toBe('ab');
});

test('renderEmail insère les URLs brutes + firstName échappé et compile le MJML', async () => {
	const { subject, html } = await renderEmail(scenario, ctx);

	// URL de clic (href du CTA) et pixel d'ouverture présents, bruts.
	expect(html).toContain(ctx.urls.click);
	expect(html).toContain(ctx.urls.open);
	// firstName échappé en HTML.
	expect(html).toContain('A&lt;&amp;&gt;B');
	// MJML a bien produit un document HTML, sans placeholder résiduel.
	expect(html.toLowerCase()).toContain('<html');
	expect(html).not.toContain('{{');
	// Sujet issu du manifeste (interpolé brut).
	expect(subject).toContain('Test de rendu');
});

test("renderEmail : le sujet est interpolé BRUT (pas d'échappement HTML)", async () => {
	// Fixture isolée : un sujet avec {{firstName}} + un gabarit MJML minimal.
	const dir = await mkdtemp(join(tmpdir(), 'redfish-subject-'));
	try {
		await writeFile(
			join(dir, 'manifest.yaml'),
			[
				'key: subjtest',
				'subject: "Bonjour {{firstName}} !"',
				'templates:',
				'  email: email.mjml'
			].join('\n')
		);
		await writeFile(
			join(dir, 'email.mjml'),
			'<mjml><mj-body><mj-section><mj-column><mj-text>Hi {{firstName}}</mj-text></mj-column></mj-section></mj-body></mjml>'
		);
		const fixture = { ...scenario, path: dir } as Scenario;
		const { subject } = await renderEmail(fixture, { ...ctx, firstName: 'A&B' });
		// « A&B » reste tel quel dans le sujet : surtout pas « A&amp;B ».
		expect(subject).toBe('Bonjour A&B !');
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test("renderEmail : le sujet est nettoyé des CR/LF (anti-injection d'en-têtes)", async () => {
	const dir = await mkdtemp(join(tmpdir(), 'redfish-subject-crlf-'));
	try {
		await writeFile(
			join(dir, 'manifest.yaml'),
			['key: crlf', 'subject: "Bonjour {{firstName}}"', 'templates:', '  email: email.mjml'].join(
				'\n'
			)
		);
		await writeFile(
			join(dir, 'email.mjml'),
			'<mjml><mj-body><mj-section><mj-column><mj-text>Hi</mj-text></mj-column></mj-section></mj-body></mjml>'
		);
		const fixture = { ...scenario, path: dir } as Scenario;
		// Tentative d'injection : CR/LF + en-tête Bcc glissés dans le prénom.
		const { subject } = await renderEmail(fixture, {
			...ctx,
			firstName: 'Eve\r\nBcc: attacker@evil.test'
		});
		expect(subject).not.toContain('\r');
		expect(subject).not.toContain('\n');
		// Le texte brut subsiste (sans saut de ligne) : plus aucun en-tête injectable.
		expect(subject).toBe('Bonjour Eve Bcc: attacker@evil.test');
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test("renderLanding : l'action du formulaire est l'URL de soumission, aucun champ nommé", async () => {
	const html = await renderLanding(scenario, ctx);

	const action = html.match(/<form[^>]*action="([^"]*)"/i);
	expect(action?.[1]).toBe(ctx.urls.submit);

	// Beacon câblé, et propriété « zéro capture » préservée : aucun input nommé.
	expect(html).toContain(ctx.urls.beacon);
	expect(/<input[^>]*\bname=/i.test(html)).toBe(false);
});

test('renderAwareness affiche le message de campagne quand il est fourni', async () => {
	const html = await renderAwareness(scenario, ctx);
	expect(html).toContain('Note propre à cette campagne.');
});

test('renderAwareness reste vide quand aucun message de campagne', async () => {
	const html = await renderAwareness(scenario, { ...ctx, awarenessMessage: undefined });
	expect(html).toContain('<div class="note"></div>');
});

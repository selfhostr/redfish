import { afterAll, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { rm } from 'node:fs/promises';

// Comme loader.test/render.test : base SQLite en mémoire partagée par tous les
// modules (bundle → loader/render → db).
vi.mock('$lib/server/db', async () => {
	const { createTestDb } = await import('../db/test-db');
	return { db: createTestDb() };
});

import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { scenarios } from '$lib/server/db/schema';
import type { Scenario } from '$lib/server/db/schema';
import { BundleImportError, exportBundle, importBundle } from './bundle';
import type { Bundle } from './bundle';
import { makeScenarioRoot, writeScenarioPackage } from './fixtures';
import { getScenario, loadScenarios } from './loader';
import { renderAwareness, renderEmail, renderLanding } from './render';
import type { RenderCtx } from './render';

/**
 * Le dépôt ne livre plus de scénario : on charge un paquet « builtin » FIXTURE
 * depuis un dossier temporaire pour couvrir l'export et le conflit de clé.
 */
const BUILTIN_KEY = 'builtin-demo';

/** Contenu BÉNIN et neutre : aucune imitation de marque réelle. */
const EMAIL =
	'<mjml><mj-body><mj-section><mj-column><mj-text>Bonjour {{firstName}}</mj-text>' +
	'<mj-button href="{{clickUrl}}">Ouvrir</mj-button></mj-column></mj-section>' +
	'<mj-raw><img src="{{openUrl}}" width="1" height="1" alt="" /></mj-raw></mj-body></mjml>';

const LANDING =
	'<!doctype html><html lang="fr"><head><meta charset="utf-8" /><title>Test</title></head>' +
	'<body><p>Bonjour {{firstName}}</p>' +
	'<form action="{{submitUrl}}" method="post"><input type="text" /><button type="submit">OK</button></form>' +
	"<script>navigator.sendBeacon('{{beaconUrl}}');</script></body></html>";

const AWARENESS =
	'<!doctype html><html lang="fr"><head><meta charset="utf-8" /><title>Test</title></head>' +
	'<body><p>Bonjour {{firstName}}</p><div class="note">{{awarenessMessage}}</div></body></html>';

function makeBundle(overrides: Partial<Bundle> = {}): Bundle {
	return {
		schemaVersion: 1,
		key: 'test-import',
		title: 'Scénario de test',
		category: 'other',
		locale: 'fr',
		difficulty: 'easy',
		tags: ['test'],
		subject: 'Test {{firstName}}',
		fromName: 'Équipe test',
		email: EMAIL,
		landing: LANDING,
		awareness: AWARENESS,
		landingMode: 'awareness',
		landingRedirectUrl: null,
		...overrides
	};
}

const ctx: RenderCtx = {
	firstName: 'A<&>B',
	lastName: 'Durand',
	email: 'a.durand@exemple.test',
	awarenessMessage: 'Note propre à cette campagne.',
	urls: {
		open: 'https://track.exemple.test/o/TKN',
		click: 'https://track.exemple.test/c/TKN',
		submit: 'https://track.exemple.test/s/TKN',
		beacon: 'https://track.exemple.test/b/TKN',
		awareness: 'https://track.exemple.test/a/TKN',
		report: 'https://track.exemple.test/r/TKN'
	}
};

let root: string;

beforeAll(async () => {
	root = await makeScenarioRoot();
	await writeScenarioPackage(root, { key: BUILTIN_KEY, title: 'Builtin démo' });
});

afterAll(async () => {
	await rm(root, { recursive: true, force: true });
});

beforeEach(async () => {
	db.delete(scenarios).run();
	await loadScenarios(root);
});

test('exportBundle : exporte un scénario builtin avec son contenu', async () => {
	const bundle = await exportBundle(BUILTIN_KEY);
	expect(bundle.schemaVersion).toBe(1);
	expect(bundle.key).toBe(BUILTIN_KEY);
	expect(bundle.subject).toBeTruthy();
	expect(bundle.email.toLowerCase()).toContain('<mjml');
	expect(bundle.landing.toLowerCase()).toContain('<form');
	expect(bundle.awareness).toContain('{{awarenessMessage}}');
	expect(Array.isArray(bundle.tags)).toBe(true);
});

test('importBundle : crée un scénario en base (source importée, path null, activé)', async () => {
	const { key } = await importBundle(makeBundle());
	expect(key).toBe('test-import');

	const row = getScenario('test-import') as Scenario;
	expect(row).toBeDefined();
	expect(row.source).toBe('imported');
	expect(row.path).toBeNull();
	expect(row.enabled).toBe(true);
	expect(row.emailTemplate).toContain('{{firstName}}');
	expect(row.landingTemplate).toContain('{{submitUrl}}');
	expect(row.awarenessTemplate).toContain('{{awarenessMessage}}');
});

test('importBundle : accepte une chaîne JSON', async () => {
	const { key } = await importBundle(JSON.stringify(makeBundle({ key: 'from-string' })));
	expect(key).toBe('from-string');
	expect(getScenario('from-string')?.source).toBe('imported');
});

test('un scénario importé se rend (e-mail, landing, sensibilisation) depuis la base', async () => {
	await importBundle(makeBundle({ key: 'rendered' }));
	const scenario = getScenario('rendered') as Scenario;

	const { subject, html } = await renderEmail(scenario, ctx);
	expect(subject).toBe('Test A<&>B'); // sujet brut, non échappé
	expect(html).toContain('A&lt;&amp;&gt;B'); // firstName échappé
	expect(html).toContain(ctx.urls.click);
	expect(html).toContain(ctx.urls.open);
	expect(html).not.toContain('{{');

	const landing = await renderLanding(scenario, ctx);
	expect(landing.match(/<form[^>]*action="([^"]*)"/i)?.[1]).toBe(ctx.urls.submit);
	expect(landing).toContain(ctx.urls.beacon);
	expect(/<input[^>]*\bname=/i.test(landing)).toBe(false);

	const awareness = await renderAwareness(scenario, ctx);
	expect(awareness).toContain('Note propre à cette campagne.');
});

test('round-trip : export d’un builtin puis import sous une nouvelle clé', async () => {
	const exported = await exportBundle(BUILTIN_KEY);
	const { key } = await importBundle({ ...exported, key: 'builtin-demo-copie' });
	expect(key).toBe('builtin-demo-copie');

	const row = getScenario('builtin-demo-copie') as Scenario;
	expect(row.source).toBe('imported');
	expect(row.emailTemplate).toBe(exported.email);
	expect(row.landingTemplate).toBe(exported.landing);
	expect(row.awarenessTemplate).toBe(exported.awareness);
});

test('import refusé : champ obligatoire manquant', async () => {
	const { subject: _s, ...withoutSubject } = makeBundle();
	await expect(importBundle(withoutSubject)).rejects.toBeInstanceOf(BundleImportError);
});

test('import refusé : un champ de formulaire porte un attribut name', async () => {
	const landing = LANDING.replace('<input type="text" />', '<input type="text" name="user" />');
	await expect(importBundle(makeBundle({ landing }))).rejects.toThrow(/name/i);
});

test('import refusé : le formulaire ne poste pas vers {{submitUrl}}', async () => {
	const landing = LANDING.replace('action="{{submitUrl}}"', 'action="https://evil.test/steal"');
	await expect(importBundle(makeBundle({ landing }))).rejects.toThrow(/submitUrl/i);
});

test('import refusé : beacon littéral absent', async () => {
	const landing = LANDING.replace("navigator.sendBeacon('{{beaconUrl}}');", '');
	await expect(importBundle(makeBundle({ landing }))).rejects.toThrow(/beacon/i);
});

test('import refusé : {{awarenessMessage}} absent', async () => {
	const awareness = AWARENESS.replace('{{awarenessMessage}}', '');
	await expect(importBundle(makeBundle({ awareness }))).rejects.toThrow(/awarenessMessage/);
});

test('import refusé : le MJML ne compile pas', async () => {
	await expect(
		importBundle(makeBundle({ email: 'ceci n’est pas du MJML' }))
	).rejects.toBeInstanceOf(BundleImportError);
});

test('import refusé : clé en conflit avec un scénario builtin', async () => {
	await expect(importBundle(makeBundle({ key: BUILTIN_KEY }))).rejects.toThrow(/livré/);
});

test('landing redirect : import OK avec une URL http(s) absolue, stockée en base', async () => {
	const { key } = await importBundle(
		makeBundle({
			key: 'redir-ok',
			landingMode: 'redirect',
			landingRedirectUrl: 'https://exemple.test/suite'
		})
	);
	expect(key).toBe('redir-ok');
	const row = getScenario('redir-ok') as Scenario;
	expect(row.landingMode).toBe('redirect');
	expect(row.landingRedirectUrl).toBe('https://exemple.test/suite');
});

test('landing redirect : mode awareness ignore l’URL fournie (NULL en base)', async () => {
	await importBundle(
		makeBundle({
			key: 'awareness-url',
			landingMode: 'awareness',
			landingRedirectUrl: 'https://exemple.test/suite'
		})
	);
	const row = getScenario('awareness-url') as Scenario;
	expect(row.landingMode).toBe('awareness');
	expect(row.landingRedirectUrl).toBeNull();
});

test('landing redirect refusé : mode redirect sans URL', async () => {
	await expect(
		importBundle(
			makeBundle({ key: 'redir-sans-url', landingMode: 'redirect', landingRedirectUrl: null })
		)
	).rejects.toBeInstanceOf(BundleImportError);
});

test('landing redirect refusé : URL non http(s)', async () => {
	await expect(
		importBundle(
			makeBundle({
				key: 'redir-js',
				landingMode: 'redirect',
				landingRedirectUrl: 'javascript:alert(1)'
			})
		)
	).rejects.toBeInstanceOf(BundleImportError);
	await expect(
		importBundle(
			makeBundle({
				key: 'redir-rel',
				landingMode: 'redirect',
				landingRedirectUrl: '/chemin/relatif'
			})
		)
	).rejects.toBeInstanceOf(BundleImportError);
});

test('landing redirect : round-trip export/import préserve mode et URL', async () => {
	await importBundle(
		makeBundle({
			key: 'redir-roundtrip',
			landingMode: 'redirect',
			landingRedirectUrl: 'https://exemple.test/final'
		})
	);
	const exported = await exportBundle('redir-roundtrip');
	expect(exported.landingMode).toBe('redirect');
	expect(exported.landingRedirectUrl).toBe('https://exemple.test/final');

	const { key } = await importBundle({ ...exported, key: 'redir-roundtrip-copie' });
	const row = getScenario(key) as Scenario;
	expect(row.landingMode).toBe('redirect');
	expect(row.landingRedirectUrl).toBe('https://exemple.test/final');
});

test('import refusé : version de schéma inconnue', async () => {
	await expect(
		importBundle(makeBundle({ schemaVersion: 2 as unknown as 1 }))
	).rejects.toBeInstanceOf(BundleImportError);
});

test('import : met à jour une clé déjà importée (upsert)', async () => {
	await importBundle(makeBundle({ key: 'maj', title: 'Avant' }));
	await importBundle(makeBundle({ key: 'maj', title: 'Après' }));
	const rows = db.select().from(scenarios).where(eq(scenarios.key, 'maj')).all();
	expect(rows.length).toBe(1);
	expect(rows[0].title).toBe('Après');
});

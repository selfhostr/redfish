import { beforeEach, expect, test, vi } from 'vitest';

vi.mock('$lib/server/db', async () => {
	const { createTestDb } = await import('$lib/server/db/test-db');
	return { db: createTestDb() };
});

import { db } from '$lib/server/db';
import { scenarios } from '$lib/server/db/schema';
import type { User } from '$lib/server/db/schema';
import { PREVIEW_CSP, PREVIEW_RECIPIENT } from '$lib/server/scenarios/preview';
import {
	SKELETON_AWARENESS,
	SKELETON_EMAIL,
	SKELETON_LANDING,
	SKELETON_SUBJECT
} from '$lib/scenarios/skeletons';
import { resetRateLimit } from '$lib/server/ratelimit';
import { POST, _PREVIEW_RATE_LIMIT } from './+server';

const superadmin = { id: 'a1', email: 'admin@example.test', role: 'superadmin' } as unknown as User;
const operator = { id: 'o1', email: 'op@example.test', role: 'operator' } as unknown as User;

const draft: Record<string, string> = {
	key: 'brouillon',
	title: 'Brouillon',
	fromName: '',
	subject: SKELETON_SUBJECT,
	email: SKELETON_EMAIL,
	landing: SKELETON_LANDING,
	awareness: SKELETON_AWARENESS
};

type Body = {
	preview: {
		subject: string;
		fromName: string;
		fromAddress: string;
		emailHtml: string;
		landingHtml: string;
		awarenessHtml: string;
	};
	issues: { field: string; message: string; details?: string[] }[];
};

function call(user: User | null, fields: Record<string, string>, asJson = false) {
	const request = asJson
		? new Request('http://localhost/scenarios/new/preview', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(fields)
			})
		: (() => {
				const fd = new FormData();
				for (const [k, v] of Object.entries(fields)) fd.set(k, v);
				return new Request('http://localhost/scenarios/new/preview', { method: 'POST', body: fd });
			})();
	return POST({ request, locals: { user } } as unknown as Parameters<typeof POST>[0]);
}

async function ok(fields: Record<string, string>): Promise<Body> {
	const res = await call(superadmin, fields);
	expect(res.status).toBe(200);
	expect(res.headers.get('cache-control')).toBe('no-store');
	return (await res.json()) as Body;
}

beforeEach(() => {
	resetRateLimit();
	db.delete(scenarios).run();
});

test('non authentifié -> 401', async () => {
	await expect(call(null, draft)).rejects.toMatchObject({ status: 401 });
});

test('opérateur -> 403', async () => {
	await expect(call(operator, draft)).rejects.toMatchObject({ status: 403 });
});

test('corps non formulaire (JSON) -> 415 : la vérification d’origine CSRF reste applicable', async () => {
	await expect(call(superadmin, draft, true)).rejects.toMatchObject({ status: 415 });
});

test('gabarit démesuré -> 413', async () => {
	await expect(call(superadmin, { ...draft, landing: 'x'.repeat(200_001) })).rejects.toMatchObject({
		status: 413
	});
});

test('rend un contenu non enregistré, assaini, sans rien écrire en base', async () => {
	const body = await ok({
		...draft,
		subject: 'Bonjour {{firstName}}',
		email: SKELETON_EMAIL.replace('Bonjour {{firstName}},', 'Salut {{firstName}}, texte inédit'),
		fromName: 'Service RH'
	});
	expect(body.issues).toEqual([]);
	expect(body.preview.subject).toBe(`Bonjour ${PREVIEW_RECIPIENT.firstName}`);
	expect(body.preview.fromName).toBe('Service RH');
	expect(body.preview.fromAddress).toBe('ne-pas-repondre@brouillon.invalid');
	expect(body.preview.emailHtml).toContain('texte inédit');
	for (const html of [
		body.preview.emailHtml,
		body.preview.landingHtml,
		body.preview.awarenessHtml
	]) {
		expect(html).toContain(PREVIEW_CSP);
		expect(html).not.toMatch(/<script/i);
		expect(html).not.toMatch(/\shref\s*=/i);
	}
	// Formulaire neutralisé, aucun champ nommé (zéro capture).
	expect(body.preview.landingHtml).not.toMatch(/<input[^>]*\sname=/i);
	expect(db.select().from(scenarios).all()).toHaveLength(0);
});

test('contenu hostile : scripts et gestionnaires retirés', async () => {
	const body = await ok({
		...draft,
		awareness:
			'<p onclick="alert(1)">{{awarenessMessage}}</p><script>alert(2)</script><img src="https://evil.test/x.png">'
	});
	expect(body.preview.awarenessHtml).not.toMatch(/onclick|<script|evil\.test/i);
});

test('MJML invalide : erreur détaillée, le reste de l’aperçu est rendu', async () => {
	const body = await ok({
		...draft,
		email:
			'<mjml><mj-body><mj-section><mj-column><mj-text>Bonjour</mj-text><mj-foo /></mj-column></mj-section></mj-body></mjml>'
	});
	const issue = body.issues.find((i) => i.field === 'email');
	expect(issue?.message).toMatch(/MJML/);
	expect(issue?.details?.length).toBeGreaterThan(0);
	expect(body.preview.emailHtml).toContain('ne compile pas');
	expect(body.preview.emailHtml).toContain(PREVIEW_CSP);
	expect(body.preview.landingHtml).toContain(PREVIEW_CSP);
});

test('variables inconnues signalées par gabarit', async () => {
	const body = await ok({
		...draft,
		subject: 'Hello {{prenom}}',
		email: SKELETON_EMAIL.replace('{{firstName}}', '{{submitUrl}}'),
		awareness: SKELETON_AWARENESS + '{{clickUrl}}'
	});
	const byField = Object.fromEntries(body.issues.map((i) => [i.field, i.message]));
	expect(byField.subject).toContain('{{prenom}}');
	expect(byField.email).toContain('{{submitUrl}}');
	expect(byField.awareness).toContain('{{clickUrl}}');
	expect(byField.landing).toBeUndefined();
});

test('violations « zéro capture » et note absente signalées en direct', async () => {
	const body = await ok({
		...draft,
		landing: SKELETON_LANDING.replace('type="text"', 'type="text" name="user"'),
		awareness: SKELETON_AWARENESS.replace('{{awarenessMessage}}', '')
	});
	expect(body.issues.find((i) => i.field === 'landing')?.message).toMatch(/name/);
	expect(body.issues.find((i) => i.field === 'awareness')?.message).toMatch(/awarenessMessage/);
	// L'aperçu, lui, ne transmet jamais d'attribut name.
	expect(body.preview.landingHtml).not.toMatch(/<(?:input|select|textarea)[^>]*\sname\s*=/i);
});

test('débit limité par utilisateur -> 429 avec Retry-After', async () => {
	// Corps invalide (JSON) : rejeté en 415 sans compiler, mais compté par le limiteur.
	for (let i = 0; i < _PREVIEW_RATE_LIMIT.limit; i++) {
		await expect(call(superadmin, draft, true)).rejects.toMatchObject({ status: 415 });
	}
	const res = await call(superadmin, draft);
	expect(res.status).toBe(429);
	expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(0);
	// Compteur propre à chaque utilisateur.
	const other = { ...superadmin, id: 'a2' } as unknown as User;
	expect((await call(other, draft)).status).toBe(200);
});

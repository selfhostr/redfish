import { expect, test } from 'vitest';
import {
	renderAwarenessContent,
	renderLandingContent,
	renderSubjectContent,
	type RenderCtx
} from '$lib/server/scenarios/render';
import { findUnknownPlaceholders, TEMPLATE_PLACEHOLDERS } from './placeholders';

const ctx: RenderCtx = {
	firstName: 'A',
	lastName: 'B',
	email: 'c@d.invalid',
	awarenessMessage: 'M',
	urls: { open: 'o', click: 'k', submit: 's', beacon: 'b', awareness: 'w' }
};

const all = (field: keyof typeof TEMPLATE_PLACEHOLDERS) =>
	TEMPLATE_PLACEHOLDERS[field].map((p) => `[{{${p.key}}}]`).join('');

test('chaque variable déclarée est bien substituée par le rendu (aucune vide)', () => {
	expect(renderSubjectContent({ subject: all('subject') }, ctx)).not.toContain('[]');
	expect(renderLandingContent({ landing: all('landing') }, ctx)).not.toContain('[]');
	expect(renderAwarenessContent({ awareness: all('awareness') }, ctx)).not.toContain('[]');
});

test('findUnknownPlaceholders : inconnues, sans doublon, espaces tolérés', () => {
	expect(findUnknownPlaceholders('{{ firstName }} {{x}} {{x}} {{clickUrl}}', 'email')).toEqual([
		'x'
	]);
	expect(findUnknownPlaceholders('{{clickUrl}}', 'landing')).toEqual(['clickUrl']);
	expect(findUnknownPlaceholders(all('awareness'), 'awareness')).toEqual([]);
});

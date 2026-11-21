import { describe, expect, test } from 'vitest';
import { decideNav, isSubmitControl } from './preview-nav';

describe('decideNav', () => {
	test('marqueur click : page de destination, quel que soit l’élément', () => {
		expect(decideNav({ tag: 'a', marker: 'click', insideForm: false })).toBe('landing');
		expect(decideNav({ tag: 'A', marker: 'click', insideForm: true })).toBe('landing');
		expect(decideNav({ tag: 'area', marker: 'click', insideForm: false })).toBe('landing');
	});

	test('sans marqueur ou marqueur inconnu : rien (plus aucune dépendance au href)', () => {
		for (const marker of [null, undefined, '', 'CLICK', 'blocked', '#rf-preview-click']) {
			expect(decideNav({ tag: 'a', marker, insideForm: false })).toBe('none');
			expect(decideNav({ tag: 'area', marker, insideForm: false })).toBe('none');
		}
		// Un bouton d'envoi non marqué ne mène nulle part.
		expect(decideNav({ tag: 'button', insideForm: true })).toBe('none');
	});

	test('contrôle d’envoi marqué dans un form : sensibilisation', () => {
		const submit = (tag: string, type?: string | null) =>
			decideNav({ tag, type, marker: 'submit', insideForm: true });
		expect(submit('button')).toBe('awareness');
		expect(submit('button', 'submit')).toBe('awareness');
		expect(submit('BUTTON', 'SUBMIT')).toBe('awareness');
		// Valeur invalide ou vide : bouton d'envoi (comme le navigateur).
		expect(submit('button', '')).toBe('awareness');
		expect(submit('button', ' button')).toBe('awareness');
		expect(submit('input', 'submit')).toBe('awareness');
		expect(submit('input', 'Image')).toBe('awareness');
	});

	test('boutons neutres, autres champs, hors form : rien', () => {
		const marked = (tag: string, type: string | null, insideForm = true) =>
			decideNav({ tag, type, marker: 'submit', insideForm });
		expect(marked('button', 'button')).toBe('none');
		expect(marked('button', 'reset')).toBe('none');
		expect(marked('button', 'RESET')).toBe('none');
		expect(marked('input', 'text')).toBe('none');
		expect(marked('input', ' submit')).toBe('none');
		expect(marked('input', null)).toBe('none');
		expect(marked('div', null)).toBe('none');
		expect(marked('button', 'submit', false)).toBe('none');
		expect(marked('input', 'image', false)).toBe('none');
	});
});

test('isSubmitControl', () => {
	expect(isSubmitControl('button', null)).toBe(true);
	expect(isSubmitControl('button', 'menu')).toBe(true);
	expect(isSubmitControl('button', 'Button')).toBe(false);
	expect(isSubmitControl('input', 'image')).toBe(true);
	expect(isSubmitControl('input', 'reset')).toBe(false);
	expect(isSubmitControl('a', 'submit')).toBe(false);
});

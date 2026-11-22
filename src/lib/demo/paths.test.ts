import { describe, expect, it } from 'vitest';
import { pageKey, rebaseHref, stripBase } from './paths';

describe('static demo paths', () => {
	it('strips the base path', () => {
		expect(stripBase('/demo', '/demo')).toBe('/');
		expect(stripBase('/demo/campaigns', '/demo')).toBe('/campaigns');
		expect(stripBase('/demonstration', '/demo')).toBeNull();
		expect(stripBase('/campaigns', '/demo')).toBeNull();
	});

	it('keys a page by its path and sorted query, without SvelteKit parameters', () => {
		const params = new URLSearchParams('x-sveltekit-invalidated=011&status=done&q=t4');
		expect(pageKey('/campaigns', params)).toBe('/campaigns?q=t4&status=done');
		expect(pageKey('/dashboard', new URLSearchParams('x-sveltekit-invalidated=1'))).toBe(
			'/dashboard'
		);
	});

	it('adds the base path to root-relative links only', () => {
		expect(rebaseHref('/campaigns?status=done', '/demo')).toBe('/demo/campaigns?status=done');
		expect(rebaseHref('/demo/campaigns', '/demo')).toBe('/demo/campaigns');
		expect(rebaseHref('/demo', '/demo')).toBe('/demo');
		expect(rebaseHref('?/totpStart', '/demo')).toBe('?/totpStart');
		expect(rebaseHref('report/pdf', '/demo')).toBe('report/pdf');
		expect(rebaseHref('//example.com/x', '/demo')).toBe('//example.com/x');
		expect(rebaseHref('https://example.com/', '/demo')).toBe('https://example.com/');
	});
});

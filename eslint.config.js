import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import ts from 'typescript-eslint';

export default ts.config(
	{
		ignores: [
			'build/',
			'.svelte-kit/',
			'node_modules/',
			'data/',
			'drizzle/',
			'static/',
			'test-results/',
			'playwright-report/'
		]
	},
	js.configs.recommended,
	...ts.configs.recommended,
	...svelte.configs.recommended,
	prettier,
	...svelte.configs.prettier,
	{
		languageOptions: { globals: { ...globals.browser, ...globals.node } }
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: { parserOptions: { parser: ts.parser } }
	},
	{
		rules: {
			// Intentionally unused variables are prefixed with `_`.
			'@typescript-eslint/no-unused-vars': [
				'error',
				{ argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true }
			],
			// `any` in a few tests and in the job queue: warning only.
			'@typescript-eslint/no-explicit-any': 'warn',
			// No base path (`paths.base`): absolute links are correct (~30 occurrences).
			'svelte/no-navigation-without-resolve': 'off',
			// Local non-reactive sets, no impact.
			'svelte/prefer-svelte-reactivity': 'off',
			// Printable report: static lists, never reordered.
			'svelte/require-each-key': 'off',
			'no-useless-assignment': 'off'
		}
	},
	{
		// Deliberate control characters in the sanitizers of preview.ts.
		files: ['src/lib/server/scenarios/preview.ts'],
		rules: { 'no-control-regex': 'off' }
	}
);

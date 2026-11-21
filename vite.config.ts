import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	build: {
		// Les polices ne doivent jamais être intégrées en data: (CSP default-src 'self').
		assetsInlineLimit: (filePath) => (/\.(woff2?|ttf|otf)$/i.test(filePath) ? false : undefined)
	},
	plugins: [
		tailwindcss(),
		// SvelteKit 3 ne lit plus svelte.config.js : la configuration (preprocess,
		// adaptateur) est passée directement au plugin Vite.
		sveltekit({
			preprocess: vitePreprocess(),
			adapter: adapter(),
			// `$lib` n'est plus fourni par défaut depuis SvelteKit 3 : on le réintroduit
			// explicitement pour garder les imports `$lib/...` existants.
			alias: { $lib: 'src/lib' }
		})
	],
	test: {
		include: ['src/**/*.{test,spec}.{js,ts}'],
		globals: true,
		environment: 'node'
	}
});

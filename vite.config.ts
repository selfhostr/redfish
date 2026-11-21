import adapter from '@sveltejs/adapter-node';
import adapterStatic from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';

// `vite build --mode demo` (npm run build:demo, see scripts/build-demo.ts): the same pages as a
// static, client-only app served under /demo, with recorded data instead of a server (src/lib/demo).
export default defineConfig(({ mode }) => {
	const demo = mode === 'demo';
	const base = demo ? '/demo' : '';
	return {
		define: { __BASE_PATH__: JSON.stringify(base) },
		build: {
			// Les polices ne doivent jamais être intégrées en data: (CSP default-src 'self').
			assetsInlineLimit: (filePath: string) =>
				/\.(woff2?|ttf|otf)$/i.test(filePath) ? false : undefined
		},
		plugins: [
			tailwindcss(),
			// SvelteKit 3 ne lit plus svelte.config.js : la configuration (preprocess,
			// adaptateur) est passée directement au plugin Vite.
			sveltekit({
				preprocess: vitePreprocess(),
				adapter: demo
					? adapterStatic({
							pages: 'build-demo',
							assets: 'build-demo',
							fallback: 'index.html',
							strict: false
						})
					: adapter(),
				...(demo ? { paths: { base, relative: false } } : {}),
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
	};
});

/**
 * Base path of the app: '' normally, '/demo' in the static demo (`vite build --mode demo`).
 * Pages and links are written for the root (`/campaigns`); the demo adds the base at runtime
 * (src/lib/demo/install.ts). Compare a pathname with a route through `appPathname`.
 */
export const BASE_PATH: string = __BASE_PATH__;

/** The pathname of a URL without the base path, as the routes and the links write it. */
export function appPathname(url: { pathname: string }): string {
	const p = url.pathname;
	return BASE_PATH && p.startsWith(BASE_PATH) ? p.slice(BASE_PATH.length) || '/' : p;
}

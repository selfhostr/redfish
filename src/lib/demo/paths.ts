/** Pure path helpers of the static demo, shared by the runtime (install.ts) and the recorder (scripts/build-demo.ts). */

/** The pathname without the base path, or null outside the app. */
export function stripBase(pathname: string, base: string): string | null {
	if (pathname === base) return '/';
	return pathname.startsWith(base + '/') ? pathname.slice(base.length) : null;
}

/** The key of a recorded page: `pathname[?query]`, SvelteKit's own parameters removed, the others sorted. */
export function pageKey(path: string, params: URLSearchParams): string {
	const q = new URLSearchParams([...params].filter(([k]) => !k.startsWith('x-sveltekit-')));
	q.sort();
	const s = q.toString();
	return s ? `${path}?${s}` : path;
}

/** A root-relative link (`/campaigns`) under the base path; anything else is left as is. */
export function rebaseHref(value: string, base: string): string {
	if (value[0] !== '/' || value[1] === '/') return value;
	return stripBase(value.split(/[?#]/)[0], base) === null ? base + value : value;
}

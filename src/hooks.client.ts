import type { ClientInit } from '@sveltejs/kit/hooks';

/** The static demo (`vite build --mode demo`) replaces the server before the app starts. */
export const init: ClientInit = async () => {
	if (import.meta.env.MODE === 'demo') (await import('$lib/demo/install')).install();
};

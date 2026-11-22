import type { User } from '$lib/server/db/schema';

declare global {
	/** Base path of the app, set by vite.config.ts (see $lib/base-path). */
	const __BASE_PATH__: string;

	namespace App {
		interface Locals {
			user: User | null;
			/** Identifiant (SHA-256 du jeton) de la session en cours, si authentifié. */
			sessionId?: string | null;
		}
	}
}

export {};

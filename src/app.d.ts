import type { User } from '$lib/server/db/schema';

declare global {
	namespace App {
		interface Locals {
			user: User | null;
			/** Identifiant (SHA-256 du jeton) de la session en cours, si authentifié. */
			sessionId?: string | null;
		}
	}
}

export {};

import type { User } from '$lib/server/db/schema';

/** Vue de l'utilisateur sérialisée vers le navigateur : liste blanche explicite, jamais de secret. */
export type PublicUser = Pick<User, 'id' | 'email' | 'role'>;

export function toPublicUser(user: User): PublicUser {
	return { id: user.id, email: user.email, role: user.role };
}

import { error, fail, redirect } from '@sveltejs/kit';
import { asc } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { resetUserTotp } from '$lib/server/account';
import type { Actions, PageServerLoad } from './$types';

/** Gestion de la 2FA des comptes, réservée aux superadmins (403 sinon). */
export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(303, '/login');
	if (locals.user.role !== 'superadmin') throw error(403, 'Accès réservé aux superadmins');
	const rows = db
		.select({ id: users.id, email: users.email, role: users.role, totpEnabled: users.totpEnabled })
		.from(users)
		.orderBy(asc(users.email))
		.all();
	return { users: rows };
};

export const actions: Actions = {
	reset2fa: async ({ request, locals }) => {
		if (!locals.user) throw redirect(303, '/login');
		if (locals.user.role !== 'superadmin') throw error(403, 'Accès réservé aux superadmins');
		const userId = String((await request.formData()).get('userId') ?? '');
		if (userId === locals.user.id)
			return fail(400, { error: 'Utilisez la page Compte pour votre propre 2FA' });
		if (!resetUserTotp(locals.user, userId))
			return fail(400, { error: 'Réinitialisation impossible (2FA non active ?)' });
		return { success: true };
	}
};

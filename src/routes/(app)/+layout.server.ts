import { redirect } from '@sveltejs/kit';
import { resolveActiveTenant } from '$lib/server/active-tenant';
import type { LayoutServerLoad } from './$types';

/** Garde du groupe de routes `(app)` : exige une session opérateur, résout le tenant actif. */
export const load: LayoutServerLoad = async ({ locals, cookies }) => {
	if (!locals.user) throw redirect(303, '/login');
	const user = locals.user;
	const { tenants, activeTenant } = await resolveActiveTenant(user, cookies);
	return { user, tenants, activeTenant };
};

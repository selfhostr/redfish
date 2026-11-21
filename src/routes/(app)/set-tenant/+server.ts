import { error, redirect } from '@sveltejs/kit';
import { localNext } from '$lib/return-path';
import { switchTenant } from '$lib/server/active-tenant';
import type { RequestHandler } from './$types';

/** Change de tenant actif (POST `tenantId`), puis revient à la page précédente. */
export const POST: RequestHandler = async ({ request, locals, cookies }) => {
	if (!locals.user) throw redirect(303, '/login');
	const data = await request.formData();
	const tenantId = String(data.get('tenantId') ?? '');
	if (!tenantId) throw error(400, 'tenantId requis');
	await switchTenant(locals.user, cookies, tenantId);
	// Garde anti-redirection ouverte : seul un chemin local est accepté.
	const back = localNext(String(data.get('redirectTo') ?? '/')) ?? '/';
	throw redirect(303, back);
};

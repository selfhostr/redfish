import { error, redirect } from '@sveltejs/kit';
import { activeTenantId } from '$lib/server/active-tenant';
import { assertTenantAccess } from '$lib/server/tenant';

/** Même autorisation que les autres actions du tenant actif. */
export async function privacyContext(
	locals: App.Locals,
	cookies: Parameters<typeof activeTenantId>[1]
) {
	if (!locals.user) throw redirect(303, '/login');
	const tenantId = await activeTenantId(locals.user, cookies);
	if (!tenantId) throw error(404, 'Client introuvable');
	await assertTenantAccess(locals.user, tenantId);
	return { user: locals.user, tenantId };
}

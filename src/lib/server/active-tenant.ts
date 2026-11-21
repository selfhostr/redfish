import { dev } from '$app/environment';
import { isHttpError, type Cookies } from '@sveltejs/kit';
import { assertTenantAccess, tenantsForUser } from '$lib/server/tenant';
import type { Tenant, User } from '$lib/server/db/schema';

export const TENANT_COOKIE = 'redfish_tenant';

/**
 * Source unique de résolution du tenant actif : cookie validé (accès + existence),
 * cookie périmé supprimé, sinon premier tenant visible.
 */
export async function resolveActiveTenant(
	user: User,
	cookies: Pick<Cookies, 'get' | 'delete'>
): Promise<{ tenants: Tenant[]; activeTenant: Tenant | null }> {
	const tenants = await tenantsForUser(user);
	let activeTenant: Tenant | null = null;
	const cookieId = cookies.get(TENANT_COOKIE);
	if (cookieId) {
		try {
			await assertTenantAccess(user, cookieId);
			activeTenant = tenants.find((t) => t.id === cookieId) ?? null;
		} catch (e) {
			if (!isHttpError(e, 403)) throw e;
		}
		if (!activeTenant) cookies.delete(TENANT_COOKIE, { path: '/' });
	}
	activeTenant ??= tenants[0] ?? null;
	return { tenants, activeTenant };
}

export async function activeTenantId(
	user: User,
	cookies: Pick<Cookies, 'get' | 'delete'>
): Promise<string | null> {
	return (await resolveActiveTenant(user, cookies)).activeTenant?.id ?? null;
}

/** Vérifie l'accès (403 sinon) puis mémorise le tenant choisi dans le cookie. */
export async function switchTenant(
	user: User,
	cookies: Pick<Cookies, 'set'>,
	tenantId: string
): Promise<void> {
	await assertTenantAccess(user, tenantId);
	cookies.set(TENANT_COOKIE, tenantId, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: !dev
	});
}

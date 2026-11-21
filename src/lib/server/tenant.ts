import { error } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { tenants, userTenants } from '$lib/server/db/schema';
import { isValidLocale } from '$lib/server/targets';
import type { Tenant, User } from '$lib/server/db/schema';

/** Tenants visibles : tous pour un superadmin, sinon ceux liés via `userTenants`. */
export async function tenantsForUser(user: User): Promise<Tenant[]> {
	if (user.role === 'superadmin') return db.select().from(tenants).all();
	return db
		.select({ tenant: tenants })
		.from(userTenants)
		.innerJoin(tenants, eq(userTenants.tenantId, tenants.id))
		.where(eq(userTenants.userId, user.id))
		.all()
		.map((r) => r.tenant);
}

/** Lève une 403 si l'utilisateur n'a pas accès au tenant. */
export async function assertTenantAccess(user: User, tenantId: string): Promise<void> {
	if (user.role === 'superadmin') return;
	const link = db
		.select()
		.from(userTenants)
		.where(and(eq(userTenants.userId, user.id), eq(userTenants.tenantId, tenantId)))
		.get();
	if (!link) throw error(403, 'Accès interdit à ce tenant');
}

/** Si `linkUserId` est fourni, le tenant et le lien `userTenants` sont créés dans une seule transaction. */
export async function createTenant(input: {
	name: string;
	locale?: string;
	linkUserId?: string;
}): Promise<Tenant> {
	const locale = (input.locale?.trim() || 'fr').toLowerCase();
	if (!isValidLocale(locale)) throw new Error(`Locale invalide : ${locale}`);
	return db.transaction((tx) => {
		const tenant = tx.insert(tenants).values({ name: input.name, locale }).returning().get();
		if (input.linkUserId) {
			tx.insert(userTenants).values({ userId: input.linkUserId, tenantId: tenant.id }).run();
		}
		return tenant;
	});
}

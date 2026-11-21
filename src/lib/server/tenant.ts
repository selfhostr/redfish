import { error } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	authorizations,
	campaignRecipients,
	campaigns,
	sendingProfiles,
	targetLists,
	targets,
	tenants,
	userTenants
} from '$lib/server/db/schema';
import { isValidLocale } from '$lib/server/targets';
import { deleteJobsForRecipients } from '$lib/server/jobs/queue';
import { DEFAULT_TIMEZONE, isValidTimeZone } from '$lib/timezone';
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

/**
 * Supprime DÉFINITIVEMENT un client et tout ce qui lui appartient. Réservé aux
 * superadmins (403 sinon ; 404 si le client n'existe pas). Ordre imposé par les
 * clés étrangères NO ACTION : jobs des destinataires du client -> autorisations
 * du client -> campagnes (cascade destinataires + événements) AVANT listes et
 * profils (référencés par les campagnes) -> listes (cascade cibles) -> cibles
 * restantes -> profils d'envoi DU client (jamais les profils globaux, tenant
 * NULL) -> client (cascade user_tenants). Le cookie de tenant actif pointant sur
 * ce client est nettoyé automatiquement au prochain chargement par
 * `resolveActiveTenant`, qui supprime un cookie dont le tenant a disparu.
 */
export async function deleteTenant(user: User, tenantId: string): Promise<void> {
	if (user.role !== 'superadmin') throw error(403, 'Seul un superadmin peut supprimer un client');
	const tenant = db.select().from(tenants).where(eq(tenants.id, tenantId)).get();
	if (!tenant) throw error(404, 'Client introuvable');
	db.transaction((tx) => {
		const recipientIds = tx
			.select({ id: campaignRecipients.id })
			.from(campaignRecipients)
			.innerJoin(campaigns, eq(campaignRecipients.campaignId, campaigns.id))
			.where(eq(campaigns.tenantId, tenantId))
			.all()
			.map((r) => r.id);
		deleteJobsForRecipients(tx, recipientIds);
		tx.delete(authorizations).where(eq(authorizations.tenantId, tenantId)).run();
		tx.delete(campaigns).where(eq(campaigns.tenantId, tenantId)).run();
		tx.delete(targetLists).where(eq(targetLists.tenantId, tenantId)).run();
		tx.delete(targets).where(eq(targets.tenantId, tenantId)).run();
		// Comparaison à une valeur : les profils globaux (tenant NULL) ne matchent pas.
		tx.delete(sendingProfiles).where(eq(sendingProfiles.tenantId, tenantId)).run();
		tx.delete(tenants).where(eq(tenants.id, tenantId)).run();
	});
}

export const CONTACT_LIMITS = { name: 120, email: 254, notes: 2000 } as const;

/** Fuseau par défaut d'un nouveau client : variable TZ du serveur si valide, sinon Europe/Zurich. */
export function defaultTimezone(): string {
	const env = process.env.TZ?.trim();
	return env && isValidTimeZone(env) ? env : DEFAULT_TIMEZONE;
}

/** Fuseau IANA du client (défaut Europe/Zurich si introuvable). */
export function tenantTimezone(tenantId: string): string {
	const row = db
		.select({ tz: tenants.timezone })
		.from(tenants)
		.where(eq(tenants.id, tenantId))
		.get();
	return row?.tz ?? DEFAULT_TIMEZONE;
}

/** Valide un nom de fuseau IANA (vide -> défaut). Lève une Error en français. */
export function validateTimezone(tz: string | null | undefined): string {
	const t = (tz ?? '').trim();
	if (!t) return defaultTimezone();
	if (!isValidTimeZone(t)) throw new Error(`Fuseau horaire invalide : ${t}`);
	return t;
}

export type TenantContactInput = {
	timezone?: string | null;
	contactName?: string | null;
	contactEmail?: string | null;
	notes?: string | null;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clean(v: string | null | undefined, max: number, label: string): string | null {
	const t = (v ?? '').trim();
	if (!t) return null;
	if (t.length > max) throw new Error(`${label} : ${max} caractères maximum`);
	return t;
}

/** Normalise et valide les champs de contact (trim, vide -> null). Lève une Error en français. */
export function validateContact(input: TenantContactInput) {
	const contactName = clean(input.contactName, CONTACT_LIMITS.name, 'Nom du contact');
	const contactEmail = clean(input.contactEmail, CONTACT_LIMITS.email, 'E-mail du contact');
	if (contactEmail && !EMAIL_RE.test(contactEmail))
		throw new Error("L'e-mail du contact est invalide");
	const notes = clean(input.notes, CONTACT_LIMITS.notes, 'Notes');
	return { contactName, contactEmail, notes };
}

/** Met à jour les champs de contact d'un client (l'appelant vérifie l'accès). */
export async function updateTenant(id: string, input: TenantContactInput): Promise<Tenant> {
	const values: ReturnType<typeof validateContact> & { timezone?: string } = validateContact(input);
	if (input.timezone !== undefined) values.timezone = validateTimezone(input.timezone);
	const row = db.update(tenants).set(values).where(eq(tenants.id, id)).returning().get();
	if (!row) throw error(404, 'Client introuvable');
	return row;
}

/** Si `linkUserId` est fourni, le tenant et le lien `userTenants` sont créés dans une seule transaction. */
export async function createTenant(
	input: {
		name: string;
		locale?: string;
		linkUserId?: string;
	} & TenantContactInput
): Promise<Tenant> {
	const locale = (input.locale?.trim() || 'fr').toLowerCase();
	if (!isValidLocale(locale)) throw new Error(`Locale invalide : ${locale}`);
	const contact = validateContact(input);
	const timezone = validateTimezone(input.timezone);
	return db.transaction((tx) => {
		const tenant = tx
			.insert(tenants)
			.values({ name: input.name, locale, timezone, ...contact })
			.returning()
			.get();
		if (input.linkUserId) {
			tx.insert(userTenants).values({ userId: input.linkUserId, tenantId: tenant.id }).run();
		}
		return tenant;
	});
}

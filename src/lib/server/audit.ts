import { and, count, desc, eq, gte, lt, sql, type SQL } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { auditLog, type AuditEntry, type User } from '$lib/server/db/schema';

/**
 * Journal d'audit : qui a fait quoi, quand, sur les actions sensibles.
 * Écriture en une ligne depuis les actions (`audit(user, 'campaign.launch', …)`).
 * Aucune IP ni saisie libre (mot de passe, e-mail tapé) n'y est écrite.
 */

export const AUDIT_ACTIONS = {
	'auth.login.success': 'Connexion réussie',
	'auth.login.failure': 'Connexion échouée',
	'auth.password.change': 'Mot de passe modifié',
	'auth.2fa.enable': '2FA activée',
	'auth.2fa.disable': '2FA désactivée',
	'auth.2fa.reset': '2FA réinitialisée par un superadmin',
	'auth.2fa.recovery_used': 'Code de secours utilisé',
	'auth.session.revoke': 'Session révoquée',
	'client.create': 'Client créé',
	'client.update': 'Client modifié',
	'client.delete': 'Client supprimé',
	'scenario.create': 'Scénario créé',
	'scenario.import': 'Scénario importé',
	'scenario.delete': 'Scénario supprimé',
	'sending_profile.create': "Profil d'envoi créé",
	'sending_profile.update': "Profil d'envoi modifié",
	'sending_profile.delete': "Profil d'envoi supprimé",
	'campaign.create': 'Campagne créée',
	'campaign.authorize': 'Autorisation ajoutée',
	'campaign.schedule': 'Campagne planifiée',
	'campaign.retry_failed': 'Envois en échec relancés',
	'campaign.launch': 'Campagne lancée',
	'campaign.complete': 'Campagne clôturée',
	'campaign.cancel': 'Campagne annulée',
	'campaign.report': 'Signalements saisis manuellement',
	'campaign.delete': 'Campagne supprimée',
	'targets.import': 'Cibles importées',
	'targets.add': 'Cible ajoutée',
	'targets.update': 'Cible modifiée',
	'targets.delete': 'Cible supprimée',
	'targets.anonymize': 'Cible anonymisée',
	'person.export': "Export des données d'une personne",
	'person.erase': "Données d'une personne effacées",
	'targets.purge': 'Cibles purgées (rétention)'
} as const;

export type AuditAction = keyof typeof AUDIT_ACTIONS;

export type AuditOptions = {
	tenantId?: string | null;
	targetType?: string;
	targetId?: string | null;
	details?: Record<string, unknown>;
};

type Actor = Pick<User, 'id' | 'email'> | null | undefined;

/**
 * Enregistre une entrée. Ne lève jamais : un échec d'écriture du journal est
 * signalé dans les logs mais n'annule pas l'action déjà effectuée.
 */
export function audit(actor: Actor, action: AuditAction, opts: AuditOptions = {}): void {
	try {
		db.insert(auditLog)
			.values({
				actorUserId: actor?.id ?? null,
				actorEmail: actor?.email ?? null,
				tenantId: opts.tenantId ?? null,
				action,
				targetType: opts.targetType ?? null,
				targetId: opts.targetId ?? null,
				detailsJson: opts.details ? JSON.stringify(opts.details) : null
			})
			.run();
	} catch (e) {
		console.error(`audit: écriture impossible (${action})`, e);
	}
}

export const AUDIT_PAGE_SIZE = 50;

export type AuditFilters = {
	action?: string;
	actor?: string;
	tenantId?: string;
	from?: Date | null;
	to?: Date | null;
	page?: number;
};

/** Lecture filtrée et paginée (la page est 1-indexée). L'appelant vérifie l'autorisation. */
export function listAudit(filters: AuditFilters): {
	entries: AuditEntry[];
	total: number;
	page: number;
	pages: number;
} {
	const where: SQL[] = [];
	if (filters.action) {
		// Préfixe : « campaign » couvre toutes les actions de campagne.
		const escaped = filters.action.replace(/[\\%_]/g, '\\$&');
		where.push(sql`${auditLog.action} like ${escaped + '%'} escape '\\'`);
	}
	if (filters.actor) {
		const escaped = filters.actor.toLowerCase().replace(/[\\%_]/g, '\\$&');
		where.push(sql`${auditLog.actorEmail} like ${'%' + escaped + '%'} escape '\\'`);
	}
	if (filters.tenantId) where.push(eq(auditLog.tenantId, filters.tenantId));
	if (filters.from) where.push(gte(auditLog.createdAt, filters.from));
	if (filters.to) where.push(lt(auditLog.createdAt, filters.to));
	const cond = where.length ? and(...where) : undefined;

	const total = db.select({ n: count() }).from(auditLog).where(cond).get()?.n ?? 0;
	const pages = Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE));
	const page = Math.min(Math.max(1, Math.floor(filters.page ?? 1) || 1), pages);
	const entries = db
		.select()
		.from(auditLog)
		.where(cond)
		.orderBy(desc(auditLog.createdAt), desc(sql`${auditLog}.rowid`))
		.limit(AUDIT_PAGE_SIZE)
		.offset((page - 1) * AUDIT_PAGE_SIZE)
		.all();
	return { entries, total, page, pages };
}

/** Durée de conservation du journal (jours), `REDFISH_AUDIT_RETENTION_DAYS`, 365 par défaut. */
export function auditRetentionDays(env: NodeJS.ProcessEnv = process.env): number {
	const n = Number(env.REDFISH_AUDIT_RETENTION_DAYS);
	return Number.isInteger(n) && n > 0 ? n : 365;
}

/** Supprime les entrées plus anciennes que la durée de conservation. */
export function purgeAuditLog(now = new Date(), days = auditRetentionDays()): number {
	const cutoff = new Date(now.getTime() - days * 86_400_000);
	return db.delete(auditLog).where(lt(auditLog.createdAt, cutoff)).run().changes;
}

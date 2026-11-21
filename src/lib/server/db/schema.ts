import { sql } from 'drizzle-orm';
import {
	check,
	index,
	integer,
	primaryKey,
	sqliteTable,
	text,
	uniqueIndex
} from 'drizzle-orm/sqlite-core';

const id = () =>
	text('id')
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID());

const createdAt = () =>
	integer('created_at', { mode: 'timestamp' })
		.notNull()
		.default(sql`(unixepoch())`);

export const tenants = sqliteTable('tenants', {
	id: id(),
	name: text('name').notNull(),
	locale: text('locale').notNull().default('fr'),
	brandingJson: text('branding_json'),
	retentionDays: integer('retention_days').notNull().default(365),
	contactName: text('contact_name'),
	contactEmail: text('contact_email'),
	notes: text('notes'),
	createdAt: createdAt()
});

export const users = sqliteTable(
	'users',
	{
		id: id(),
		email: text('email').notNull().unique(),
		passwordHash: text('password_hash').notNull(),
		role: text('role', { enum: ['superadmin', 'operator'] }).notNull(),
		/** Secret TOTP chiffré (AES-256-GCM via `REDFISH_SECRET_KEY`) ; NULL sans 2FA. */
		totpSecretEnc: text('totp_secret_enc'),
		/** 2FA active : posé seulement après confirmation d'un premier code. */
		totpEnabled: integer('totp_enabled', { mode: 'boolean' }).notNull().default(false),
		/** Dernier pas TOTP accepté : un code ne peut pas être rejoué. */
		totpLastStep: integer('totp_last_step'),
		createdAt: createdAt()
	},
	(t) => [check('users_role_check', sql`${t.role} in ('superadmin', 'operator')`)]
);

/** `id` = hash SHA-256 du jeton de session (défini par le module d'authentification). */
export const sessions = sqliteTable('sessions', {
	id: text('id').primaryKey(),
	userId: text('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
	/** Défaut côté application (SQLite refuse un défaut non constant en ALTER TABLE). */
	createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
	lastUsedAt: integer('last_used_at', { mode: 'timestamp' }),
	/** User-Agent tronqué, pour reconnaître la session dans la page Compte. L'IP n'est jamais stockée. */
	userAgent: text('user_agent')
});

/** Codes de secours 2FA : à usage unique, seule l'empreinte SHA-256 est stockée. */
export const recoveryCodes = sqliteTable(
	'recovery_codes',
	{
		id: id(),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		codeHash: text('code_hash').notNull(),
		usedAt: integer('used_at', { mode: 'timestamp' })
	},
	(t) => [index('recovery_codes_user_idx').on(t.userId)]
);

/**
 * Seconde étape de connexion (2FA) : créée après un mot de passe valide,
 * consommée par un code TOTP ou de secours. `id` = SHA-256 du jeton du cookie.
 */
export const loginChallenges = sqliteTable('login_challenges', {
	id: text('id').primaryKey(),
	userId: text('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	attempts: integer('attempts').notNull().default(0),
	expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull()
});

export const userTenants = sqliteTable(
	'user_tenants',
	{
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		tenantId: text('tenant_id')
			.notNull()
			.references(() => tenants.id, { onDelete: 'cascade' })
	},
	(t) => [primaryKey({ columns: [t.userId, t.tenantId] })]
);

export const sendingProfiles = sqliteTable('sending_profiles', {
	id: id(),
	tenantId: text('tenant_id').references(() => tenants.id), // NULL = global
	name: text('name').notNull(),
	host: text('host').notNull(),
	port: integer('port').notNull(),
	username: text('username').notNull(),
	passwordEnc: text('password_enc').notNull(),
	fromName: text('from_name').notNull(),
	fromAddress: text('from_address').notNull(),
	headersJson: text('headers_json'),
	createdAt: createdAt()
});

export const scenarios = sqliteTable(
	'scenarios',
	{
		id: id(),
		key: text('key').notNull().unique(),
		title: text('title').notNull(),
		category: text('category').notNull(),
		locale: text('locale').notNull(),
		difficulty: text('difficulty').notNull(),
		tagsJson: text('tags_json'),
		/** Origine du contenu : `builtin` lu sur disque, `imported` stocké en base. */
		source: text('source', { enum: ['builtin', 'imported'] })
			.notNull()
			.default('builtin'),
		/** Dossier du paquet sur disque (builtin) ; NULL pour un scénario importé. */
		path: text('path'),
		/** Contenu en base d'un scénario importé (NULL pour un builtin). */
		subject: text('subject'),
		fromName: text('from_name'),
		emailTemplate: text('email_template'),
		landingTemplate: text('landing_template'),
		awarenessTemplate: text('awareness_template'),
		enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
		registeredAt: integer('registered_at', { mode: 'timestamp' })
			.notNull()
			.default(sql`(unixepoch())`)
	},
	(t) => [check('scenarios_source_check', sql`${t.source} in ('builtin', 'imported')`)]
);

export const targetLists = sqliteTable('target_lists', {
	id: id(),
	tenantId: text('tenant_id')
		.notNull()
		.references(() => tenants.id),
	name: text('name').notNull(),
	createdAt: createdAt()
});

export const targets = sqliteTable(
	'targets',
	{
		id: id(),
		listId: text('list_id')
			.notNull()
			.references(() => targetLists.id, { onDelete: 'cascade' }),
		tenantId: text('tenant_id')
			.notNull()
			.references(() => tenants.id),
		firstName: text('first_name').notNull(),
		lastName: text('last_name').notNull(),
		email: text('email').notNull(),
		department: text('department'),
		locale: text('locale'),
		/** Posé par la rétention : PII effacée (nom vidé, e-mail masqué). */
		anonymizedAt: integer('anonymized_at', { mode: 'timestamp' }),
		createdAt: createdAt()
	},
	(t) => [
		index('targets_list_idx').on(t.listId),
		uniqueIndex('targets_list_email_uq').on(t.listId, t.email)
	]
);

export const campaigns = sqliteTable(
	'campaigns',
	{
		id: id(),
		tenantId: text('tenant_id')
			.notNull()
			.references(() => tenants.id),
		name: text('name').notNull(),
		scenarioId: text('scenario_id')
			.notNull()
			.references(() => scenarios.id),
		sendingProfileId: text('sending_profile_id')
			.notNull()
			.references(() => sendingProfiles.id),
		targetListId: text('target_list_id')
			.notNull()
			.references(() => targetLists.id),
		status: text('status', { enum: ['draft', 'scheduled', 'sending', 'completed'] })
			.notNull()
			.default('draft'),
		trackingDomain: text('tracking_domain').notNull(),
		awarenessMessage: text('awareness_message'),
		scheduledAt: integer('scheduled_at', { mode: 'timestamp' }),
		/** Motif du dernier échec de lancement programmé (campagne repassée en brouillon). */
		launchError: text('launch_error'),
		/** Clôture (automatique après la fenêtre d'observation, ou manuelle) ; null tant que non terminée. */
		completedAt: integer('completed_at', { mode: 'timestamp' }),
		createdAt: createdAt()
	},
	(t) => [
		index('campaigns_tenant_idx').on(t.tenantId),
		check(
			'campaigns_status_check',
			sql`${t.status} in ('draft', 'scheduled', 'sending', 'completed')`
		)
	]
);

export const authorizations = sqliteTable('authorizations', {
	id: id(),
	tenantId: text('tenant_id')
		.notNull()
		.references(() => tenants.id),
	campaignId: text('campaign_id').references(() => campaigns.id),
	reference: text('reference').notNull(),
	filePath: text('file_path'),
	validFrom: integer('valid_from', { mode: 'timestamp' }).notNull(),
	validUntil: integer('valid_until', { mode: 'timestamp' }).notNull(),
	approvedBy: text('approved_by').notNull(),
	createdAt: createdAt()
});

export const campaignRecipients = sqliteTable(
	'campaign_recipients',
	{
		id: id(),
		campaignId: text('campaign_id')
			.notNull()
			.references(() => campaigns.id, { onDelete: 'cascade' }),
		targetId: text('target_id')
			.notNull()
			.references(() => targets.id),
		token: text('token').notNull().unique(),
		sendStatus: text('send_status', { enum: ['pending', 'sent', 'skipped', 'failed'] })
			.notNull()
			.default('pending'),
		sentAt: integer('sent_at', { mode: 'timestamp' }),
		/** Motif court (sans secret) d'un échec d'envoi définitif. */
		sendError: text('send_error')
	},
	(t) => [
		index('campaign_recipients_campaign_idx').on(t.campaignId),
		check(
			'campaign_recipients_send_status_check',
			sql`${t.sendStatus} in ('pending', 'sent', 'failed', 'skipped')`
		)
	]
);

export const events = sqliteTable(
	'events',
	{
		id: id(),
		campaignRecipientId: text('campaign_recipient_id')
			.notNull()
			.references(() => campaignRecipients.id, { onDelete: 'cascade' }),
		type: text('type', {
			enum: [
				'sent',
				'opened',
				'clicked',
				'page_interaction',
				'form_submitted',
				'awareness_viewed',
				'reported'
			]
		}).notNull(),
		uaCategory: text('ua_category'),
		isAutomated: integer('is_automated', { mode: 'boolean' }).notNull().default(false),
		createdAt: createdAt()
	},
	(t) => [
		index('events_recipient_idx').on(t.campaignRecipientId),
		check(
			'events_type_check',
			sql`${t.type} in ('sent', 'opened', 'clicked', 'page_interaction', 'form_submitted', 'awareness_viewed', 'reported')`
		)
	]
);

export const jobs = sqliteTable(
	'jobs',
	{
		id: id(),
		type: text('type').notNull(),
		payloadJson: text('payload_json').notNull(),
		runAt: integer('run_at', { mode: 'timestamp' }).notNull(),
		attempts: integer('attempts').notNull().default(0),
		status: text('status', { enum: ['queued', 'running', 'retry', 'done', 'failed'] })
			.notNull()
			.default('queued'),
		lockedAt: integer('locked_at', { mode: 'timestamp' }),
		createdAt: createdAt()
	},
	(t) => [
		index('jobs_status_run_idx').on(t.status, t.runAt),
		check('jobs_status_check', sql`${t.status} in ('queued', 'running', 'retry', 'done', 'failed')`)
	]
);

/** Battement de cœur du worker : une ligne par worker (id fixe 'worker'), mise à jour à chaque boucle. */
export const workerHeartbeat = sqliteTable('worker_heartbeat', {
	id: text('id').primaryKey(),
	beatAt: integer('beat_at', { mode: 'timestamp' }).notNull()
});

/**
 * Journal d'audit des actions sensibles. Pas de clé étrangère sur `tenant_id`
 * ni `actor_user_id` : une entrée survit à la suppression du client ou du
 * compte (l'e-mail de l'acteur est figé dans `actor_email`). Aucune IP stockée.
 */
export const auditLog = sqliteTable(
	'audit_log',
	{
		id: id(),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date()),
		actorUserId: text('actor_user_id'),
		actorEmail: text('actor_email'),
		tenantId: text('tenant_id'),
		action: text('action').notNull(),
		targetType: text('target_type'),
		targetId: text('target_id'),
		detailsJson: text('details_json')
	},
	(t) => [
		index('audit_log_created_idx').on(t.createdAt),
		index('audit_log_tenant_idx').on(t.tenantId, t.createdAt)
	]
);

export type Tenant = typeof tenants.$inferSelect;
export type NewTenant = typeof tenants.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type SendingProfile = typeof sendingProfiles.$inferSelect;
export type Scenario = typeof scenarios.$inferSelect;
export type TargetList = typeof targetLists.$inferSelect;
export type Target = typeof targets.$inferSelect;
export type Campaign = typeof campaigns.$inferSelect;
export type Authorization = typeof authorizations.$inferSelect;
export type CampaignRecipient = typeof campaignRecipients.$inferSelect;
export type CampaignEvent = typeof events.$inferSelect;
export type Job = typeof jobs.$inferSelect;
export type RecoveryCode = typeof recoveryCodes.$inferSelect;
export type AuditEntry = typeof auditLog.$inferSelect;

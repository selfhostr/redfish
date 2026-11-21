CREATE UNIQUE INDEX `targets_list_email_uq` ON `targets` (`list_id`,`email`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_campaign_recipients` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`target_id` text NOT NULL,
	`token` text NOT NULL,
	`send_status` text DEFAULT 'pending' NOT NULL,
	`sent_at` integer,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`target_id`) REFERENCES `targets`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "campaign_recipients_send_status_check" CHECK("__new_campaign_recipients"."send_status" in ('pending', 'sent', 'failed', 'skipped'))
);
--> statement-breakpoint
INSERT INTO `__new_campaign_recipients`("id", "campaign_id", "target_id", "token", "send_status", "sent_at") SELECT "id", "campaign_id", "target_id", "token", "send_status", "sent_at" FROM `campaign_recipients`;--> statement-breakpoint
DROP TABLE `campaign_recipients`;--> statement-breakpoint
ALTER TABLE `__new_campaign_recipients` RENAME TO `campaign_recipients`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_recipients_token_unique` ON `campaign_recipients` (`token`);--> statement-breakpoint
CREATE INDEX `campaign_recipients_campaign_idx` ON `campaign_recipients` (`campaign_id`);--> statement-breakpoint
CREATE TABLE `__new_campaigns` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`name` text NOT NULL,
	`scenario_id` text NOT NULL,
	`sending_profile_id` text NOT NULL,
	`target_list_id` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`tracking_domain` text NOT NULL,
	`awareness_message` text,
	`scheduled_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`scenario_id`) REFERENCES `scenarios`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`sending_profile_id`) REFERENCES `sending_profiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`target_list_id`) REFERENCES `target_lists`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "campaigns_status_check" CHECK("__new_campaigns"."status" in ('draft', 'scheduled', 'sending', 'completed'))
);
--> statement-breakpoint
INSERT INTO `__new_campaigns`("id", "tenant_id", "name", "scenario_id", "sending_profile_id", "target_list_id", "status", "tracking_domain", "awareness_message", "scheduled_at", "created_at") SELECT "id", "tenant_id", "name", "scenario_id", "sending_profile_id", "target_list_id", "status", "tracking_domain", "awareness_message", "scheduled_at", "created_at" FROM `campaigns`;--> statement-breakpoint
DROP TABLE `campaigns`;--> statement-breakpoint
ALTER TABLE `__new_campaigns` RENAME TO `campaigns`;--> statement-breakpoint
CREATE INDEX `campaigns_tenant_idx` ON `campaigns` (`tenant_id`);--> statement-breakpoint
CREATE TABLE `__new_events` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_recipient_id` text NOT NULL,
	`type` text NOT NULL,
	`ua_category` text,
	`is_automated` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`campaign_recipient_id`) REFERENCES `campaign_recipients`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "events_type_check" CHECK("__new_events"."type" in ('sent', 'opened', 'clicked', 'page_interaction', 'form_submitted', 'awareness_viewed', 'reported'))
);
--> statement-breakpoint
INSERT INTO `__new_events`("id", "campaign_recipient_id", "type", "ua_category", "is_automated", "created_at") SELECT "id", "campaign_recipient_id", "type", "ua_category", "is_automated", "created_at" FROM `events`;--> statement-breakpoint
DROP TABLE `events`;--> statement-breakpoint
ALTER TABLE `__new_events` RENAME TO `events`;--> statement-breakpoint
CREATE INDEX `events_recipient_idx` ON `events` (`campaign_recipient_id`);--> statement-breakpoint
CREATE TABLE `__new_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`payload_json` text NOT NULL,
	`run_at` integer NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`locked_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	CONSTRAINT "jobs_status_check" CHECK("__new_jobs"."status" in ('queued', 'running', 'retry', 'done', 'failed'))
);
--> statement-breakpoint
INSERT INTO `__new_jobs`("id", "type", "payload_json", "run_at", "attempts", "status", "locked_at", "created_at") SELECT "id", "type", "payload_json", "run_at", "attempts", "status", "locked_at", "created_at" FROM `jobs`;--> statement-breakpoint
DROP TABLE `jobs`;--> statement-breakpoint
ALTER TABLE `__new_jobs` RENAME TO `jobs`;--> statement-breakpoint
CREATE INDEX `jobs_status_run_idx` ON `jobs` (`status`,`run_at`);--> statement-breakpoint
CREATE TABLE `__new_users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	CONSTRAINT "users_role_check" CHECK("__new_users"."role" in ('superadmin', 'operator'))
);
--> statement-breakpoint
INSERT INTO `__new_users`("id", "email", "password_hash", "role", "created_at") SELECT "id", "email", "password_hash", "role", "created_at" FROM `users`;--> statement-breakpoint
DROP TABLE `users`;--> statement-breakpoint
ALTER TABLE `__new_users` RENAME TO `users`;--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);
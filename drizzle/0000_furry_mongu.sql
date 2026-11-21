CREATE TABLE `authorizations` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`campaign_id` text,
	`reference` text NOT NULL,
	`file_path` text,
	`valid_from` integer NOT NULL,
	`valid_until` integer NOT NULL,
	`approved_by` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `campaign_recipients` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`target_id` text NOT NULL,
	`token` text NOT NULL,
	`send_status` text DEFAULT 'pending' NOT NULL,
	`sent_at` integer,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`target_id`) REFERENCES `targets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_recipients_token_unique` ON `campaign_recipients` (`token`);--> statement-breakpoint
CREATE INDEX `campaign_recipients_campaign_idx` ON `campaign_recipients` (`campaign_id`);--> statement-breakpoint
CREATE TABLE `campaigns` (
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
	FOREIGN KEY (`target_list_id`) REFERENCES `target_lists`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `campaigns_tenant_idx` ON `campaigns` (`tenant_id`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_recipient_id` text NOT NULL,
	`type` text NOT NULL,
	`ua_category` text,
	`is_automated` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`campaign_recipient_id`) REFERENCES `campaign_recipients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `events_recipient_idx` ON `events` (`campaign_recipient_id`);--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`payload_json` text NOT NULL,
	`run_at` integer NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`locked_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `jobs_status_run_idx` ON `jobs` (`status`,`run_at`);--> statement-breakpoint
CREATE TABLE `scenarios` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`title` text NOT NULL,
	`category` text NOT NULL,
	`locale` text NOT NULL,
	`difficulty` text NOT NULL,
	`tags_json` text,
	`path` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`registered_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `scenarios_key_unique` ON `scenarios` (`key`);--> statement-breakpoint
CREATE TABLE `sending_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text,
	`name` text NOT NULL,
	`host` text NOT NULL,
	`port` integer NOT NULL,
	`username` text NOT NULL,
	`password_enc` text NOT NULL,
	`from_name` text NOT NULL,
	`from_address` text NOT NULL,
	`headers_json` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `target_lists` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `targets` (
	`id` text PRIMARY KEY NOT NULL,
	`list_id` text NOT NULL,
	`tenant_id` text NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`email` text NOT NULL,
	`department` text,
	`locale` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`list_id`) REFERENCES `target_lists`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `targets_list_idx` ON `targets` (`list_id`);--> statement-breakpoint
CREATE TABLE `tenants` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`locale` text DEFAULT 'fr' NOT NULL,
	`branding_json` text,
	`retention_days` integer DEFAULT 365 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `user_tenants` (
	`user_id` text NOT NULL,
	`tenant_id` text NOT NULL,
	PRIMARY KEY(`user_id`, `tenant_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);
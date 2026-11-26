PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_events` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_recipient_id` text NOT NULL,
	`type` text NOT NULL,
	`ua_category` text,
	`is_automated` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`campaign_recipient_id`) REFERENCES `campaign_recipients`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "events_type_check" CHECK("__new_events"."type" in ('sent', 'opened', 'attachment_opened', 'clicked', 'page_interaction', 'form_submitted', 'awareness_viewed', 'reported'))
);
--> statement-breakpoint
INSERT INTO `__new_events`("id", "campaign_recipient_id", "type", "ua_category", "is_automated", "created_at") SELECT "id", "campaign_recipient_id", "type", "ua_category", "is_automated", "created_at" FROM `events`;--> statement-breakpoint
DROP TABLE `events`;--> statement-breakpoint
ALTER TABLE `__new_events` RENAME TO `events`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `events_recipient_idx` ON `events` (`campaign_recipient_id`);--> statement-breakpoint
CREATE TABLE `__new_scenarios` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`title` text NOT NULL,
	`category` text NOT NULL,
	`locale` text NOT NULL,
	`difficulty` text NOT NULL,
	`tags_json` text,
	`source` text DEFAULT 'builtin' NOT NULL,
	`path` text,
	`subject` text,
	`from_name` text,
	`email_template` text,
	`landing_template` text,
	`awareness_template` text,
	`landing_mode` text DEFAULT 'awareness' NOT NULL,
	`landing_redirect_url` text,
	`attachment_mode` text DEFAULT 'none' NOT NULL,
	`attachment_filename` text,
	`attachment_template` text,
	`enabled` integer DEFAULT true NOT NULL,
	`archived_at` integer,
	`registered_at` integer DEFAULT (unixepoch()) NOT NULL,
	CONSTRAINT "scenarios_source_check" CHECK("__new_scenarios"."source" in ('builtin', 'imported')),
	CONSTRAINT "scenarios_landing_mode_check" CHECK("__new_scenarios"."landing_mode" in ('awareness', 'redirect')),
	CONSTRAINT "scenarios_attachment_mode_check" CHECK("__new_scenarios"."attachment_mode" in ('none', 'html', 'pdf'))
);
--> statement-breakpoint
INSERT INTO `__new_scenarios`("id", "key", "title", "category", "locale", "difficulty", "tags_json", "source", "path", "subject", "from_name", "email_template", "landing_template", "awareness_template", "landing_mode", "landing_redirect_url", "enabled", "archived_at", "registered_at") SELECT "id", "key", "title", "category", "locale", "difficulty", "tags_json", "source", "path", "subject", "from_name", "email_template", "landing_template", "awareness_template", "landing_mode", "landing_redirect_url", "enabled", "archived_at", "registered_at" FROM `scenarios`;--> statement-breakpoint
DROP TABLE `scenarios`;--> statement-breakpoint
ALTER TABLE `__new_scenarios` RENAME TO `scenarios`;--> statement-breakpoint
CREATE UNIQUE INDEX `scenarios_key_unique` ON `scenarios` (`key`);
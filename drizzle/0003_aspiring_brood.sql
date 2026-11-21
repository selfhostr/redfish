PRAGMA foreign_keys=OFF;--> statement-breakpoint
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
	`enabled` integer DEFAULT true NOT NULL,
	`registered_at` integer DEFAULT (unixepoch()) NOT NULL,
	CONSTRAINT "scenarios_source_check" CHECK("__new_scenarios"."source" in ('builtin', 'imported'))
);
--> statement-breakpoint
INSERT INTO `__new_scenarios`("id", "key", "title", "category", "locale", "difficulty", "tags_json", "path", "enabled", "registered_at") SELECT "id", "key", "title", "category", "locale", "difficulty", "tags_json", "path", "enabled", "registered_at" FROM `scenarios`;--> statement-breakpoint
DROP TABLE `scenarios`;--> statement-breakpoint
ALTER TABLE `__new_scenarios` RENAME TO `scenarios`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `scenarios_key_unique` ON `scenarios` (`key`);
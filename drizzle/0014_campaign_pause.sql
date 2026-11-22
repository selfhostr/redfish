PRAGMA foreign_keys=OFF;--> statement-breakpoint
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
	`launch_error` text,
	`completed_at` integer,
	`spread_hours` integer,
	`working_hours_only` integer DEFAULT false NOT NULL,
	`work_start_hour` integer DEFAULT 8 NOT NULL,
	`work_end_hour` integer DEFAULT 18 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`scenario_id`) REFERENCES `scenarios`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`sending_profile_id`) REFERENCES `sending_profiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`target_list_id`) REFERENCES `target_lists`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "campaigns_status_check" CHECK("__new_campaigns"."status" in ('draft', 'scheduled', 'sending', 'paused', 'completed'))
);
--> statement-breakpoint
INSERT INTO `__new_campaigns`("id", "tenant_id", "name", "scenario_id", "sending_profile_id", "target_list_id", "status", "tracking_domain", "awareness_message", "scheduled_at", "launch_error", "completed_at", "spread_hours", "working_hours_only", "work_start_hour", "work_end_hour", "created_at") SELECT "id", "tenant_id", "name", "scenario_id", "sending_profile_id", "target_list_id", "status", "tracking_domain", "awareness_message", "scheduled_at", "launch_error", "completed_at", "spread_hours", "working_hours_only", "work_start_hour", "work_end_hour", "created_at" FROM `campaigns`;--> statement-breakpoint
DROP TABLE `campaigns`;--> statement-breakpoint
ALTER TABLE `__new_campaigns` RENAME TO `campaigns`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `campaigns_tenant_idx` ON `campaigns` (`tenant_id`);
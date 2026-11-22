ALTER TABLE `campaign_recipients` ADD `planned_at` integer;--> statement-breakpoint
ALTER TABLE `campaigns` ADD `spread_hours` integer;--> statement-breakpoint
ALTER TABLE `campaigns` ADD `working_hours_only` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `campaigns` ADD `work_start_hour` integer DEFAULT 8 NOT NULL;--> statement-breakpoint
ALTER TABLE `campaigns` ADD `work_end_hour` integer DEFAULT 18 NOT NULL;
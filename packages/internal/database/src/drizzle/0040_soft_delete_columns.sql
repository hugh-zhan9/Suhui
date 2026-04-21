ALTER TABLE `feeds` ADD `deleted_at` integer;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `deleted_at` integer;--> statement-breakpoint
ALTER TABLE `inboxes` ADD `deleted_at` integer;--> statement-breakpoint
ALTER TABLE `lists` ADD `deleted_at` integer;--> statement-breakpoint
ALTER TABLE `entries` ADD `deleted_at` integer;--> statement-breakpoint
ALTER TABLE `collections` ADD `deleted_at` integer;

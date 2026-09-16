CREATE TABLE `translation_batches` (
	`entry_id` text NOT NULL,
	`language` text NOT NULL,
	`source_hash` text NOT NULL,
	`plan_version` integer NOT NULL,
	`target` text NOT NULL,
	`batch_id` text NOT NULL,
	`config_hash` text NOT NULL,
	`values` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`entry_id`, `language`, `source_hash`, `plan_version`, `target`, `batch_id`),
	FOREIGN KEY (`entry_id`) REFERENCES `entries`(`id`) ON UPDATE no action ON DELETE cascade
);

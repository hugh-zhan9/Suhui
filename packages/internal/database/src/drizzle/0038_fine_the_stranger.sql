CREATE TABLE `applied_sync_ops` (
	`op_id` text PRIMARY KEY NOT NULL,
	`applied_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `pending_sync_ops` (
	`op_id` text PRIMARY KEY NOT NULL,
	`op_json` text NOT NULL,
	`retry_after` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL
);

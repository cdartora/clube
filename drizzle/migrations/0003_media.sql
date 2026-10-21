CREATE TABLE `media` (
	`key` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`size` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `media_user_created_idx` ON `media` (`user_id`,`created_at`);
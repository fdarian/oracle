CREATE TABLE `notes` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`referenceId` integer NOT NULL,
	`path` text NOT NULL,
	`content` text NOT NULL,
	CONSTRAINT `fk_notes_referenceId_references_id_fk` FOREIGN KEY (`referenceId`) REFERENCES `references`(`id`)
);
--> statement-breakpoint
CREATE TABLE `references` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`name` text NOT NULL UNIQUE,
	`repo` text,
	`domains` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notes_reference_id_path_unique` ON `notes` (`referenceId`,`path`);
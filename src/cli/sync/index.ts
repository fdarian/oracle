import { Command } from "effect/cli";
import { enable } from "./enable";

export const sync = Command.make("sync").pipe(
	Command.withDescription("Sync the database with a libSQL server"),
	Command.withSubcommands([enable]),
);

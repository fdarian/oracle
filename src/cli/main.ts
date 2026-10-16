import { BunRuntime, BunServices } from "@effect/platform-bun";
import { Effect } from "effect";
import { Command } from "effect/cli";
import { version } from "#/meta.ts";
import { importCommand } from "./import";
import { mcp } from "./mcp";
import { sync } from "./sync";

const oracle = Command.make("oracle").pipe(
	Command.withSubcommands([mcp, importCommand, sync]),
);

const program = Command.run(oracle, {
	version: version,
});

program.pipe(Effect.provide(BunServices.layer), BunRuntime.runMain);

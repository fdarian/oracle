import { BunServices } from "@effect/platform-bun";
import { Effect } from "effect";
import { Command } from "effect/unstable/cli";
import { version } from "#/meta.ts";
import { runtime } from "#/server/runtime.ts";
import { mcp } from "./mcp";

const oracle = Command.make("oracle").pipe(Command.withSubcommands([mcp]));

const program = Command.run(oracle, {
	version: version,
});

program.pipe(Effect.provide(BunServices.layer), runtime.runPromise);

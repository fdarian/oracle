import { Command } from "effect/unstable/cli";
import { stdio } from "./stdio";

export const mcp = Command.make("mcp").pipe(Command.withSubcommands([stdio]));

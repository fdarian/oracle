import { Command } from "effect/cli";
import { stdio } from "./stdio";

export const mcp = Command.make("mcp").pipe(
	Command.withDescription("Run the oracle MCP server"),
	Command.withSubcommands([stdio]),
);

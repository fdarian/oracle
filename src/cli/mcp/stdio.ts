import { Command } from "effect/cli";
import { startMcpStdio } from "#/mcp/index.ts";

export const stdio = Command.make("stdio", {}, () => startMcpStdio);

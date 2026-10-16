import { Command } from "effect/unstable/cli";
import { startMcpStdio } from "#/mcp/index.ts";

export const stdio = Command.make("stdio", {}, () => startMcpStdio);

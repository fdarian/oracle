import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { encode } from "@toon-format/toon";
import { Effect } from "effect";
import { type RuntimeServices, runtime } from "#/server/runtime.ts";

export function ok(value: unknown): CallToolResult {
	return {
		content: [{ type: "text", text: encode(value) }],
	};
}

export function fail(message: string): CallToolResult {
	return {
		content: [{ type: "text", text: message }],
		isError: true,
	};
}

/**
 * Runs a tool program through the shared runtime. Any unexpected error
 * (parse, filesystem, config) is surfaced as an MCP tool error rather than
 * rejecting the promise — expected errors should already be mapped via
 * `Effect.catchTag` into a `fail(...)` result before reaching here.
 */
export function runTool<E>(
	program: Effect.Effect<CallToolResult, E, RuntimeServices>,
) {
	return runtime.runPromise(
		program.pipe(
			Effect.catchCause((error) =>
				Effect.succeed(fail(`Internal error: ${String(error)}`)),
			),
		),
	);
}

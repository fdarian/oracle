import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Effect } from "effect";
import { z } from "zod";
import { ReferencesService } from "#/references.ts";
import { fail, ok, runTool } from "./common";

export function referenceDeleteTool(server: McpServer) {
	server.registerTool(
		"reference_delete",
		{
			description:
				"Delete a reference entry. Errors if the entry does not exist.",
			inputSchema: {
				name: z.string(),
			},
		},
		(input) =>
			runTool(
				Effect.gen(function* () {
					const refs = yield* ReferencesService;
					yield* refs.delete(input.name);
					return ok({ deleted: input.name });
				}).pipe(
					Effect.catchTag("ReferenceNotFound", (err) =>
						Effect.succeed(fail(`Reference not found: ${err.name}`)),
					),
				),
			),
	);
}

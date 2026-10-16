import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Effect } from "effect";
import { z } from "zod";
import { ReferencesService } from "#/references.ts";
import { fail, ok, runTool } from "./common";

export function notesWriteTool(server: McpServer) {
	server.registerTool(
		"notes_write",
		{
			description:
				"Create or overwrite a reference note. The reference must already exist.",
			inputSchema: {
				path: z.string().describe("Reference name or reference/subpath"),
				content: z.string(),
			},
		},
		(input) =>
			runTool(
				Effect.gen(function* () {
					const refs = yield* ReferencesService;
					const entry = yield* refs.writeNote(input.path, input.content);
					return ok(entry);
				}).pipe(
					Effect.catchTag("ReferenceNotFound", (err) =>
						Effect.succeed(
							fail(
								`Reference not found: ${err.name} — create it with reference_upsert first`,
							),
						),
					),
				),
			),
	);
}

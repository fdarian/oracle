import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Effect } from "effect";
import { z } from "zod";
import { ReferencesService } from "#/references.ts";
import { fail, ok, runTool } from "./common";

export function notesReadTool(server: McpServer) {
	server.registerTool(
		"notes_read",
		{
			description:
				"Read a reference note. Use reference name for the index note, or reference/subpath for a sub-note.",
			inputSchema: {
				path: z.string().describe("Reference name or reference/subpath"),
			},
		},
		(input) =>
			runTool(
				Effect.gen(function* () {
					const refs = yield* ReferencesService;
					const content = yield* refs.readNote(input.path);
					return ok(content);
				}).pipe(
					Effect.catchTag("ReferenceNotFound", (err) =>
						Effect.succeed(fail(`Reference not found: ${err.name}`)),
					),
					Effect.catchTag("NoteNotFound", (err) =>
						Effect.succeed(
							fail(
								`Note not found for ${err.name}: ${err.path}. Available note paths: ${err.available.join(", ")}`,
							),
						),
					),
				),
			),
	);
}

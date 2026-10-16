import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Effect } from "effect";
import { z } from "zod";
import { ReferencesService } from "#/references.ts";
import { fail, ok, runTool } from "./common";

export function notesEditTool(server: McpServer) {
	server.registerTool(
		"notes_edit",
		{
			description:
				"Edit a reference note by exact string replacement. By default old_string must occur exactly once.",
			inputSchema: {
				path: z.string().describe("Reference name or reference/subpath"),
				old_string: z.string(),
				new_string: z.string(),
				replace_all: z.boolean().optional(),
			},
		},
		(input) =>
			runTool(
				Effect.gen(function* () {
					const refs = yield* ReferencesService;
					const entry = yield* refs.editNote(
						input.path,
						input.old_string,
						input.new_string,
						input.replace_all === true,
					);
					return ok(entry);
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
					Effect.catchTag("NoteEditFailed", (err) =>
						Effect.succeed(
							fail(`Could not edit note ${err.path}: ${err.reason}`),
						),
					),
				),
			),
	);
}

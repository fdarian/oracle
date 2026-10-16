import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Effect } from "effect";
import { z } from "zod";
import { ReferencesService } from "#/references.ts";
import { fail, ok, runTool } from "./common";

export function referenceGetTool(server: McpServer) {
	return server.registerTool(
		"reference_get",
		{
			description: "Get the full entry for a named reference.",
			inputSchema: {
				name: z.string().describe("Reference name to look up"),
			},
		},
		(input) =>
			runTool(
				Effect.gen(function* () {
					const refs = yield* ReferencesService;
					const entry = yield* refs.get(input.name);
					const indexNote = entry.notes.find((note) => note.path === "");
					const files = entry.notes
						.filter((note) => note.path !== "")
						.map((note) => note.path);
					return ok({
						domains: entry.domains,
						repo: entry.repo,
						note: indexNote?.content,
						files,
					});
				}).pipe(
					Effect.catchTag("ReferenceNotFound", (err) =>
						Effect.succeed(fail(`Reference not found: ${err.name}`)),
					),
				),
			),
	);
}

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Effect } from "effect";
import { z } from "zod";
import { ReferencesService } from "#/references.ts";
import { ok, runTool } from "./common";

export function referenceUpsertTool(server: McpServer) {
	server.registerTool(
		"reference_upsert",
		{
			description:
				"Create or update a reference entry's domains and repo, then persist. Notes are managed by notes_write and notes_edit.",
			inputSchema: {
				name: z.string(),
				domains: z.array(z.string()),
				repo: z.string().optional(),
			},
		},
		(input) =>
			runTool(
				Effect.gen(function* () {
					const refs = yield* ReferencesService;
					const saved = yield* refs.upsert(input.name, {
						domains: input.domains,
						repo: input.repo,
					});
					return ok(saved);
				}),
			),
	);
}

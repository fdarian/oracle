import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Effect } from "effect";
import { z } from "zod";
import { ReferencesService } from "#/references.ts";
import { ok, runTool } from "./common";

export function referencesSearchTool(server: McpServer) {
	server.registerTool(
		"references_search",
		{
			description:
				"Case-insensitive substring search across reference names, domains, repo, and notes. Returns a terse list; call reference_get for full detail.",
			inputSchema: {
				keyword: z.string().describe("Substring to search for"),
			},
		},
		(input) =>
			runTool(
				Effect.gen(function* () {
					const refs = yield* ReferencesService;
					const results = yield* refs.search(input.keyword);
					return ok(results);
				}),
			),
	);
}

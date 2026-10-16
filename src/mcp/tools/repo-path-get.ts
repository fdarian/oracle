import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Effect } from "effect";
import { z } from "zod";
import { ReposService } from "#/repos.ts";
import { fail, ok, runTool } from "./common";

export function repoPathGetTool(server: McpServer) {
	server.registerTool(
		"repo_path_get",
		{
			description:
				'Return the local path for a GitHub repo (clones if needed). Input must be "org/name".',
			inputSchema: {
				repo: z.string().describe('GitHub repo in "org/name" format'),
			},
		},
		(input) =>
			runTool(
				Effect.gen(function* () {
					const repos = yield* ReposService;
					const result = yield* repos.getRepoPath(input.repo);
					return ok(result);
				}).pipe(
					Effect.catchTag("InvalidRepoFormat", (err) =>
						Effect.succeed(
							fail(`Invalid repo format "${err.input}": expected "org/name"`),
						),
					),
					Effect.catchTag("GitCloneFailed", (err) =>
						Effect.succeed(
							fail(
								`Git clone failed for "${err.repo}" (exit code ${err.exitCode})`,
							),
						),
					),
				),
			),
	);
}

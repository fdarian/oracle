import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Effect } from "effect";
import { version } from "#/meta.ts";
import { notesEditTool } from "./tools/notes-edit";
import { notesReadTool } from "./tools/notes-read";
import { notesWriteTool } from "./tools/notes-write";
import { referenceDeleteTool } from "./tools/reference-delete";
import { referenceGetTool } from "./tools/reference-get";
import { referencesSearchTool } from "./tools/reference-search";
import { referenceUpsertTool } from "./tools/reference-upsert";
import { repoPathGetTool } from "./tools/repo-path-get";

export const startMcpStdio = Effect.gen(function* () {
	const server = new McpServer({
		name: "oracle",
		version: version,
	});

	referenceGetTool(server);
	referencesSearchTool(server);
	referenceUpsertTool(server);
	referenceDeleteTool(server);
	notesReadTool(server);
	notesWriteTool(server);
	notesEditTool(server);
	repoPathGetTool(server);

	const transport = new StdioServerTransport();
	yield* Effect.promise(() => server.connect(transport));
});

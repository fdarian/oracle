Claude Code plugin (also its own marketplace) that ships `oracle`: a stdio MCP server holding a curated registry of library docs references (docs domains, GitHub repo, markdown notes), plus an `oracle` subagent that consults it before searching docs via exa or reading cloned source.

## Stack

- pnpm (package manager), bun (runtime and bundler), TypeScript (`@total-typescript/tsconfig` bundler/no-dom/app)
- Effect (`effect`, `@effect/platform-bun`) for all logic; `effect` and `@effect/platform-bun` are pinned to an exact `4.0.0-rc.109` (the `effect/unstable/*` APIs differ in 4.0.5+), with `@effect/platform-node-shared` overridden to match in `pnpm-workspace.yaml`
- `@modelcontextprotocol/sdk` for the MCP server (stdio transport); zod for tool input schemas; Effect Schema for the references file
- Path alias `#/*` → `src/*`; kebab-case filenames

## Plugin layout

Repo root is both the plugin root and the marketplace root.

- `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json` — no `version` field, so the commit SHA is the version
- `.mcp.json` — runs `bun ${CLAUDE_PLUGIN_ROOT}/dist/oracle.js mcp stdio`
- `agents/oracle.md` — the subagent. Plugin agents can't declare `mcpServers`, so tools are referenced by their plugin names `mcp__plugin_oracle_oracle__<tool>`; keep them in sync with the tool names registered in `src/mcp/tools/`

## Gotchas

- **`dist/oracle.js` is committed and is what the plugin runs** (plugin installs have no `node_modules`). Run `pnpm build` and commit `dist/` in the same commit as any `src/` change.
- Data lives at `${CLAUDE_PLUGIN_DATA}/references.json` (`~/.claude/plugins/data/oracle-oracle/`). `ORACLE_REFERENCES_PATH` is required, with no default; a missing file is treated as empty state, not an error.
- The JSON store is slated to move to SQLite; don't build features that depend on the file format.
- Biome ignores `dist/`.

## Dev

- `pnpm check:type`, `pnpm check:lint`, `pnpm format`, `pnpm build`
- `ORACLE_REFERENCES_PATH=/tmp/references.json bun run entries/cli.ts mcp stdio` — run the server from source over stdio
- `claude plugin validate . --strict` — validate the manifests

## Architecture

- `entries/cli.ts` — bundle entry; imports `src/cli/main.ts` (Effect CLI: `oracle mcp stdio`, `--version`)
- `src/mcp/index.ts` — constructs the McpServer, registers the 8 tools in `src/mcp/tools/`, connects StdioServerTransport
- `src/references.ts` — Effect Schema for the references file + `ReferencesService` (load/save/search/upsert/delete/readNote/writeNote/editNote)
- `src/repos.ts` — `ReposService`: clones `org/name` GitHub repos under `$TMPDIR/github/` and reports HEAD/branch
- `src/errors.ts` — tagged errors
- `src/server/runtime.ts` — shared ManagedRuntime
- `src/meta.ts` — version, read from `package.json` via JSON import so it survives bundling

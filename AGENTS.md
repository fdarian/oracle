Stdio MCP server (`oracle`) holding a curated registry of library docs references (docs domains, GitHub repo, markdown notes), plus an `oracle` Claude Code subagent that consults it before searching docs via exa or reading cloned source.

## Stack

- pnpm (package manager), bun (runtime), TypeScript (`@total-typescript/tsconfig` bundler/no-dom/app)
- Effect (`effect`, `@effect/platform-bun`) for all logic; `effect` and `@effect/platform-bun` are pinned to an exact `4.0.5`
- `@modelcontextprotocol/sdk` for the MCP server (stdio transport); zod for tool input schemas; Effect Schema for the references file
- Path alias `#/*` → `src/*`; kebab-case filenames

## Agent

`agents/oracle.md` is the subagent, copied by users into `~/.claude/agents/`. Its `mcpServers` frontmatter launches `bun run <repo>/entries/cli.ts mcp stdio` with `ORACLE_REFERENCES_PATH`; the two paths are placeholders the user replaces. Tool names in the body are the bare names registered in `src/mcp/tools/`; keep them in sync.

## Gotchas

- `ORACLE_REFERENCES_PATH` is required, with no default; a missing file is treated as empty state, not an error.
- The JSON store is slated to move to SQLite; don't build features that depend on the file format.

## Dev

- `pnpm check:type`, `pnpm check:lint`, `pnpm format`
- `ORACLE_REFERENCES_PATH=/tmp/references.json bun run entries/cli.ts mcp stdio` — run the server from source over stdio

## Architecture

- `entries/cli.ts` — CLI entry; imports `src/cli/main.ts` (Effect CLI: `oracle mcp stdio`, `--version`)
- `src/mcp/index.ts` — constructs the McpServer, registers the 8 tools in `src/mcp/tools/`, connects StdioServerTransport
- `src/references.ts` — Effect Schema for the references file + `ReferencesService` (load/save/search/upsert/delete/readNote/writeNote/editNote)
- `src/repos.ts` — `ReposService`: clones `org/name` GitHub repos under `$TMPDIR/github/` and reports HEAD/branch
- `src/errors.ts` — tagged errors
- `src/server/runtime.ts` — shared ManagedRuntime
- `src/meta.ts` — version, read from `package.json` via JSON import

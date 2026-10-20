Stdio MCP server (`oracle`) holding a curated registry of library docs references (docs domains, GitHub repo, markdown notes), plus an `oracle` Claude Code subagent that consults it before searching docs or reading cloned source.

## Stack

- pnpm (package manager), bun (runtime), TypeScript (`@total-typescript/tsconfig` bundler/no-dom/app)
- Effect (`effect`, `@effect/platform-bun`) for all logic; `effect` and `@effect/platform-bun` are pinned to an exact `4.0.5`
- libSQL (`@libsql/client` via `@effect/sql-libsql`) for storage: a local SQLite file, or an embedded replica of a libSQL server (Turso Cloud, `sqld`) when `ORACLE_SYNC_URL` is set
- Drizzle ORM `1.0.0-rc.5` with its Effect adapter (`drizzle-orm/effect-libsql`): queries are `yield* db.select()…`; drizzle-kit for migrations
- `@modelcontextprotocol/sdk` for the MCP server (stdio transport); zod for tool input schemas; Effect Schema for the `references.json` import format
- Path alias `#/*` → `src/*`; kebab-case filenames

## Agent

`agents/oracle.md` is the subagent, copied by users into `~/.claude/agents/`. Its `mcpServers` frontmatter launches `bun run <repo>/entries/cli.ts mcp stdio` with `ORACLE_DB_PATH`; the two paths are placeholders the user replaces. Tool names in the body are the bare names registered in `src/mcp/tools/`; keep them in sync.

## Gotchas

- `ORACLE_DB_PATH` is required, with no default. `ORACLE_SYNC_URL` / `ORACLE_SYNC_TOKEN` are optional.
- A local-only file can't become a replica in place (libSQL refuses to sync a file it didn't create); `oracle sync enable` copies rows to the server and bootstraps a fresh replica instead.
- A replica can't open while its server is unreachable, and opening one without `ORACLE_SYNC_URL` is refused so local writes never fork it.
- Search uses an FTS5 trigram table (`references_fts`, rowid = `references.id`) that the service rebuilds per reference on every write; any new write path must call `reindex`. drizzle-kit can't express virtual tables, so it lives in a custom migration and `src/db/search.ts` (outside the kit schema) describes it for queries.
- Schema changes: edit `src/db/schema.ts`, then `pnpm db:generate`; commit the generated `drizzle/` files alone as `ci: migration`. Migrations run on startup from `drizzle/`.

## Dev

- `pnpm check:type`, `pnpm check:lint`, `pnpm format`, `pnpm db:generate`
- `ORACLE_DB_PATH=/tmp/oracle.db bun run entries/cli.ts mcp stdio` — run the server from source over stdio
- Local sync server for testing: `sqld --db-path <dir> --http-listen-addr 127.0.0.1:8090`, then `ORACLE_SYNC_URL=http://127.0.0.1:8090`

## Architecture

- `entries/cli.ts` — CLI entry; imports `src/cli/main.ts` (Effect CLI: `oracle mcp stdio`, `oracle import <file>`, `oracle sync enable`)
- `src/mcp/index.ts` — constructs the McpServer, registers the 8 tools in `src/mcp/tools/`, connects StdioServerTransport
- `src/database.ts` — env config, the `Database` service (Drizzle, migrated on build), and `DatabaseLayer` (local file or replica, pulls on startup)
- `src/db/schema.ts` — Drizzle tables (`references`, `notes`); `src/db/search.ts` — query-only FTS table
- `src/references.ts` — `ReferencesService` over Drizzle (search/get/upsert/delete/readNote/writeNote/editNote, plus exportAll/importAll for the JSON format)
- `src/repos.ts` — `ReposService`: clones `org/name` GitHub repos under `$TMPDIR/github/` and reports HEAD/branch
- `src/errors.ts` — tagged errors
- `src/server/runtime.ts` — ManagedRuntime the MCP tools run on
- `src/meta.ts` — version, read from `package.json` via JSON import

# oracle

A Claude Code subagent that answers "how does library X work" questions from a curated reference list instead of blind web searches. It comes with an MCP server that stores, per library, its docs domains, GitHub repo and your own notes. The agent looks the library up there first, then reads the docs (via exa) or the cloned source.

## Install

Requires [bun](https://bun.sh) on your `PATH` and the [exa](https://exa.ai) MCP server (`web_search_exa`, `web_fetch_exa`) configured.

```sh
git clone https://github.com/fdarian/oracle
cd oracle && pnpm install
cp agents/oracle.md ~/.claude/agents/oracle.md
```

Then edit `~/.claude/agents/oracle.md` and replace the two placeholder paths in the `mcpServers` frontmatter with absolute paths:

- `/path/to/oracle` — your clone
- `/path/to/oracle.db` — where your reference list is stored, a SQLite file created on first run

Restart Claude Code.

## Use

Ask Claude a library question and it delegates to the `oracle` agent, or call it directly: "ask oracle how drizzle's `pgTable` options work". Unknown libraries are added to the list (domains, repo, an index note) after the first lookup, so the next one is instant.

## Sync across machines

The database is local-only by default. To share it between machines, point it at a [libSQL](https://github.com/tursodatabase/libsql) server: [Turso Cloud](https://turso.tech) (free tier is plenty) or a self-hosted `sqld`.

1. Add the server to the agent's `env`, next to `ORACLE_DB_PATH`:
   ```yaml
   ORACLE_SYNC_URL: "libsql://<db>.turso.io"
   ORACLE_SYNC_TOKEN: "<token>"   # omit if the server has no auth
   ```
2. On the machine that already has data, copy it to the server once, with the same three variables set in your shell:
   ```sh
   bun run entries/cli.ts sync enable
   ```
   This uploads every reference, moves the local file to `oracle.db.bak`, and replaces it with a synced replica.
3. On other machines, set the same variables with any `ORACLE_DB_PATH`. The replica fills itself from the server on first start.

Reads are local and each agent run pulls the latest state on start. Writes go to the server, so two agents never overwrite each other's file.

<details>
<summary>Caveats</summary>

- A synced database needs its server to open. Offline, the oracle tools return an error instead of stale data.
- The token sits in plain text in `~/.claude/agents/oracle.md`.
- Unsetting `ORACLE_SYNC_URL` on a replica is refused, since local writes would fork it from the server. To go back to local-only, restore `oracle.db.bak`; it lacks anything written since sync was enabled.

</details>

<details>
<summary>Migrating from references.json</summary>

Earlier versions stored the list in a JSON file. Import it once:

```sh
ORACLE_DB_PATH=/path/to/oracle.db bun run entries/cli.ts import /path/to/references.json
```

Existing references with the same name are replaced.

</details>

## Development

```sh
pnpm format        # biome
pnpm check:type
pnpm check:lint
```

See [AGENTS.md](./AGENTS.md) for the layout.

## License

MIT

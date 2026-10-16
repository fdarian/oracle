# oracle

A Claude Code plugin that answers "how does library X work" questions from a curated reference list instead of blind web searches. It bundles an MCP server that stores, per library, its docs domains, GitHub repo and your own notes, and an `oracle` subagent that looks the library up there first, then reads the docs (via exa) or the cloned source.

## Install

Requires [bun](https://bun.sh) on your `PATH`.

```
/plugin marketplace add fdarian/oracle
/plugin install oracle@oracle
```

The agent also uses the [exa](https://exa.ai) MCP server (`web_search_exa`, `web_fetch_exa`) for docs lookups, so have that configured.

## Use

Ask Claude a library question and it delegates to the `oracle` agent, or call it directly: "ask oracle how drizzle's `pgTable` options work". Unknown libraries are added to the list (domains, repo, an index note) after the first lookup, so the next one is instant.

References are stored in `${CLAUDE_PLUGIN_DATA}/references.json`, which is `~/.claude/plugins/data/oracle-oracle/references.json`. A missing file is an empty list.

<details>
<summary>Importing an existing references.json</summary>

Copy it into the data directory and restart Claude Code:

```sh
mkdir -p ~/.claude/plugins/data/oracle-oracle
cp references.json ~/.claude/plugins/data/oracle-oracle/references.json
```

</details>

## Development

```sh
pnpm install
pnpm format        # biome
pnpm check:type
pnpm check:lint
pnpm build         # bundles entries/cli.ts to dist/oracle.js
```

The plugin runs the committed `dist/oracle.js`, so rebuild and commit it with every `src/` change. See [AGENTS.md](./AGENTS.md) for the layout.

## License

MIT

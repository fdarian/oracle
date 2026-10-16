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
- `/path/to/references.json` — where your reference list is stored; a missing file is an empty list

Restart Claude Code.

## Use

Ask Claude a library question and it delegates to the `oracle` agent, or call it directly: "ask oracle how drizzle's `pgTable` options work". Unknown libraries are added to the list (domains, repo, an index note) after the first lookup, so the next one is instant.

## Development

```sh
pnpm format        # biome
pnpm check:type
pnpm check:lint
```

See [AGENTS.md](./AGENTS.md) for the layout.

## License

MIT

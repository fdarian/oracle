import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Query-only view of the FTS5 virtual table created by a custom migration;
 * kept out of `schema.ts` so drizzle-kit never tries to create it as a regular
 * table. `rowid` is the `references.id` it indexes.
 */
export const referencesFts = sqliteTable("references_fts", {
	rowid: integer().notNull(),
	name: text().notNull(),
	domains: text(),
	repo: text(),
	notes: text(),
	rank: real(),
});

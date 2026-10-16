import {
	integer,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const references = sqliteTable("references", {
	id: integer().primaryKey({ autoIncrement: true }),
	name: text().notNull().unique(),
	repo: text(),
	domains: text({ mode: "json" }).$type<ReadonlyArray<string>>().notNull(),
});

export const notes = sqliteTable(
	"notes",
	{
		id: integer().primaryKey({ autoIncrement: true }),
		referenceId: integer()
			.notNull()
			.references(() => references.id),
		path: text().notNull(),
		content: text().notNull(),
	},
	(table) => [
		uniqueIndex("notes_reference_id_path_unique").on(
			table.referenceId,
			table.path,
		),
	],
);

import { and, asc, desc, eq, inArray, or, type SQL, sql } from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";
import { Context, Effect, Layer, Schema } from "effect";
import { Database } from "#/database.ts";
import { notes, references } from "#/db/schema.ts";
import { referencesFts } from "#/db/search.ts";
import { NoteEditFailed, NoteNotFound, ReferenceNotFound } from "#/errors.ts";

const ReferenceNote = Schema.Struct({
	path: Schema.String,
	content: Schema.String,
});
type ReferenceNote = typeof ReferenceNote.Type;

const ReferenceEntry = Schema.Struct({
	domains: Schema.Array(Schema.String),
	repo: Schema.optional(Schema.String),
	notes: Schema.Array(ReferenceNote),
});
type ReferenceEntry = typeof ReferenceEntry.Type;

/** The legacy `references.json` shape, kept as the import/export format. */
export const ReferencesFile = Schema.Struct({
	references: Schema.Record(Schema.String, ReferenceEntry),
});
export type ReferencesFile = typeof ReferencesFile.Type;

type ReferenceRow = typeof references.$inferSelect;

function toEntry(row: ReferenceRow, entryNotes: ReadonlyArray<ReferenceNote>) {
	const entry: ReferenceEntry = {
		domains: row.domains,
		repo: row.repo === null ? undefined : row.repo,
		notes: entryNotes,
	};
	return entry;
}

function countOccurrences(content: string, oldString: string) {
	return content.split(oldString).length - 1;
}

/** Quotes the keyword as one FTS5 string so punctuation in it is never parsed as query syntax. */
function ftsPhrase(keyword: string) {
	return `"${keyword.replaceAll('"', '""')}"`;
}

function containsIgnoringCase(column: SQLiteColumn, keyword: string): SQL {
	const pattern = `%${keyword.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
	return sql`${column} LIKE ${pattern} ESCAPE '\\'`;
}

/** Trigram FTS5 can't MATCH fewer than three characters, so shorter keywords fall back to LIKE. */
const minimumMatchLength = 3;

export class ReferencesService extends Context.Service<ReferencesService>()(
	"oracle/ReferencesService",
	{
		make: Effect.gen(function* () {
			const db = yield* Database;

			const reindex = (ids: ReadonlyArray<number>) =>
				Effect.gen(function* () {
					yield* db
						.delete(referencesFts)
						.where(inArray(referencesFts.rowid, [...ids]));
					yield* db
						.insert(referencesFts, "rowid", "name", "domains", "repo", "notes")
						.select(
							db
								.select({
									rowid: references.id,
									name: references.name,
									domains:
										sql<string>`(SELECT group_concat(value, ' ') FROM json_each(${references.domains}))`.as(
											"domains",
										),
									repo: references.repo,
									notes:
										sql<string>`(SELECT group_concat(${notes.content}, char(10)) FROM ${notes} WHERE ${notes.referenceId} = ${references.id})`.as(
											"notes",
										),
								})
								.from(references)
								.where(inArray(references.id, [...ids])),
						);
				});

			const findReference = (name: string) =>
				Effect.gen(function* () {
					const row = yield* db
						.select()
						.from(references)
						.where(eq(references.name, name))
						.get();
					if (row === undefined) {
						return yield* new ReferenceNotFound({ name });
					}
					return row;
				});

			const loadEntry = (name: string) =>
				Effect.gen(function* () {
					const row = yield* findReference(name);
					const rows = yield* db
						.select({ path: notes.path, content: notes.content })
						.from(notes)
						.where(eq(notes.referenceId, row.id))
						.orderBy(asc(notes.path));
					return toEntry(row, rows);
				});

			/** Splits `name/sub/path` at the longest reference name that prefixes it. */
			const resolveNoteTarget = (fullPath: string) =>
				Effect.gen(function* () {
					const match = yield* db
						.select({ id: references.id, name: references.name })
						.from(references)
						.where(
							or(
								eq(references.name, fullPath),
								sql`substr(${fullPath}, 1, length(${references.name}) + 1) = ${references.name} || '/'`,
							),
						)
						.orderBy(desc(sql`length(${references.name})`))
						.get();
					if (match === undefined) {
						return yield* new ReferenceNotFound({ name: fullPath });
					}
					const path =
						match.name === fullPath
							? ""
							: fullPath.slice(match.name.length + 1);
					return { id: match.id, name: match.name, path };
				});

			const findNote = (target: { id: number; name: string; path: string }) =>
				Effect.gen(function* () {
					const note = yield* db
						.select({ content: notes.content })
						.from(notes)
						.where(
							and(
								eq(notes.referenceId, target.id),
								eq(notes.path, target.path),
							),
						)
						.get();
					if (note === undefined) {
						const available = yield* db
							.select({ path: notes.path })
							.from(notes)
							.where(eq(notes.referenceId, target.id))
							.orderBy(asc(notes.path));
						return yield* new NoteNotFound({
							name: target.name,
							path: target.path,
							available: available.map((row) => row.path),
						});
					}
					return note;
				});

			const saveNote = (
				target: { id: number; name: string; path: string },
				content: string,
			) =>
				Effect.gen(function* () {
					yield* db
						.insert(notes)
						.values({ referenceId: target.id, path: target.path, content })
						.onConflictDoUpdate({
							target: [notes.referenceId, notes.path],
							set: { content },
						});
					yield* reindex([target.id]);
					return yield* loadEntry(target.name);
				});

			const transaction = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
				db.transaction(() => effect);

			const searchColumns = {
				name: references.name,
				repo: references.repo,
				domains: references.domains,
			};

			return {
				search: (keyword: string) =>
					Effect.gen(function* () {
						const query = db
							.select(searchColumns)
							.from(referencesFts)
							.innerJoin(references, eq(references.id, referencesFts.rowid));
						const rows =
							keyword.length >= minimumMatchLength
								? yield* query
										.where(sql`${referencesFts} MATCH ${ftsPhrase(keyword)}`)
										.orderBy(asc(referencesFts.rank))
								: yield* query
										.where(
											or(
												containsIgnoringCase(referencesFts.name, keyword),
												containsIgnoringCase(referencesFts.domains, keyword),
												containsIgnoringCase(referencesFts.repo, keyword),
												containsIgnoringCase(referencesFts.notes, keyword),
											),
										)
										.orderBy(asc(references.name));
						return rows.map((row) => ({
							name: row.name,
							repo: row.repo === null ? undefined : row.repo,
							domains: row.domains,
						}));
					}),

				get: loadEntry,

				upsert: (name: string, entry: { domains: string[]; repo?: string }) =>
					transaction(
						Effect.gen(function* () {
							const repo = entry.repo === undefined ? null : entry.repo;
							const row = yield* db
								.insert(references)
								.values({ name, repo, domains: entry.domains })
								.onConflictDoUpdate({
									target: references.name,
									set: { repo, domains: entry.domains },
								})
								.returning({ id: references.id })
								.get();
							yield* reindex([row.id]);
							return yield* loadEntry(name);
						}),
					),

				readNote: (fullPath: string) =>
					Effect.gen(function* () {
						const target = yield* resolveNoteTarget(fullPath);
						const note = yield* findNote(target);
						return note.content;
					}),

				writeNote: (fullPath: string, content: string) =>
					transaction(
						Effect.gen(function* () {
							const target = yield* resolveNoteTarget(fullPath);
							return yield* saveNote(target, content);
						}),
					),

				editNote: (
					fullPath: string,
					oldString: string,
					newString: string,
					replaceAll: boolean,
				) =>
					transaction(
						Effect.gen(function* () {
							const target = yield* resolveNoteTarget(fullPath);
							const note = yield* findNote(target);
							const occurrences = countOccurrences(note.content, oldString);
							if (occurrences === 0) {
								return yield* new NoteEditFailed({
									path: fullPath,
									reason: "old_string not found",
								});
							}
							if (!replaceAll && occurrences > 1) {
								return yield* new NoteEditFailed({
									path: fullPath,
									reason:
										"old_string is not unique; pass replace_all true to replace all occurrences",
								});
							}
							const content = replaceAll
								? note.content.replaceAll(oldString, newString)
								: note.content.replace(oldString, newString);
							return yield* saveNote(target, content);
						}),
					),

				delete: (name: string) =>
					transaction(
						Effect.gen(function* () {
							const row = yield* findReference(name);
							yield* db.delete(notes).where(eq(notes.referenceId, row.id));
							yield* db.delete(references).where(eq(references.id, row.id));
							yield* db
								.delete(referencesFts)
								.where(eq(referencesFts.rowid, row.id));
						}),
					),

				exportAll: Effect.gen(function* () {
					const rows = yield* db
						.select()
						.from(references)
						.orderBy(asc(references.name));
					const noteRows = yield* db
						.select()
						.from(notes)
						.orderBy(asc(notes.path));
					const fileReferences: Record<string, ReferenceEntry> = {};
					for (const row of rows) {
						fileReferences[row.name] = toEntry(
							row,
							noteRows
								.filter((note) => note.referenceId === row.id)
								.map((note) => ({ path: note.path, content: note.content })),
						);
					}
					const file: ReferencesFile = { references: fileReferences };
					return file;
				}),

				/** Upserts every reference in `file`, replacing its notes wholesale. */
				importAll: (file: ReferencesFile) =>
					transaction(
						Effect.gen(function* () {
							const entries = Object.entries(file.references);
							if (entries.length === 0) return 0;
							const rows = yield* db
								.insert(references)
								.values(
									entries.map((pair) => ({
										name: pair[0],
										repo: pair[1].repo === undefined ? null : pair[1].repo,
										domains: pair[1].domains,
									})),
								)
								.onConflictDoUpdate({
									target: references.name,
									set: {
										repo: sql`excluded.repo`,
										domains: sql`excluded.domains`,
									},
								})
								.returning({ id: references.id, name: references.name });
							const ids = rows.map((row) => row.id);
							const idByName = new Map(rows.map((row) => [row.name, row.id]));
							yield* db.delete(notes).where(inArray(notes.referenceId, ids));
							const noteRows: Array<typeof notes.$inferInsert> = [];
							for (const pair of entries) {
								const referenceId = idByName.get(pair[0]);
								if (referenceId === undefined) {
									return yield* Effect.die(
										`upsert returned no id for reference ${pair[0]}`,
									);
								}
								for (const note of pair[1].notes) {
									noteRows.push({
										referenceId,
										path: note.path,
										content: note.content,
									});
								}
							}
							if (noteRows.length > 0) {
								yield* db.insert(notes).values(noteRows);
							}
							yield* reindex(ids);
							return rows.length;
						}),
					),
			};
		}),
	},
) {
	static layer = Layer.effect(ReferencesService, this.make);
}

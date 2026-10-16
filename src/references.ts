import { Context, Effect, Layer, Schema } from "effect";
import { SqlClient } from "effect/sql";
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

const Domains = Schema.fromJsonString(Schema.Array(Schema.String));

const ReferenceRow = Schema.Struct({
	name: Schema.String,
	repo: Schema.NullOr(Schema.String),
	domains: Domains,
});
type ReferenceRow = typeof ReferenceRow.Type;

const NoteRow = Schema.Struct({
	reference_name: Schema.String,
	path: Schema.String,
	content: Schema.String,
});

const decodeReferenceRows = Schema.decodeUnknownEffect(
	Schema.Array(ReferenceRow),
);
const decodeNoteRows = Schema.decodeUnknownEffect(Schema.Array(NoteRow));
const encodeDomains = Schema.encodeEffect(Domains);
const decodeNames = Schema.decodeUnknownEffect(
	Schema.Array(Schema.Struct({ name: Schema.String })),
);

function toEntry(row: ReferenceRow, notes: ReadonlyArray<ReferenceNote>) {
	const entry: ReferenceEntry = {
		domains: row.domains,
		repo: row.repo === null ? undefined : row.repo,
		notes,
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

function likePattern(keyword: string) {
	return `%${keyword.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

/** Trigram FTS5 can't MATCH fewer than three characters, so shorter keywords fall back to LIKE. */
const minimumMatchLength = 3;

export class ReferencesService extends Context.Service<ReferencesService>()(
	"oracle/ReferencesService",
	{
		make: Effect.gen(function* () {
			const sql = yield* SqlClient.SqlClient;

			const reindex = (names: ReadonlyArray<string>) =>
				Effect.gen(function* () {
					yield* sql`DELETE FROM reference_search WHERE name IN ${sql.in(names)}`;
					yield* sql`INSERT INTO reference_search (name, domains, repo, notes)
						SELECT
							r.name,
							(SELECT group_concat(value, ' ') FROM json_each(r.domains)),
							r.repo,
							(SELECT group_concat(n.content, char(10)) FROM note n WHERE n.reference_name = r.name)
						FROM reference r
						WHERE r.name IN ${sql.in(names)}`;
				});

			const findReference = (name: string) =>
				Effect.gen(function* () {
					const rows =
						yield* sql`SELECT name, repo, domains FROM reference WHERE name = ${name}`;
					const decoded = yield* decodeReferenceRows(rows);
					const row = decoded[0];
					if (row === undefined) {
						return yield* new ReferenceNotFound({ name });
					}
					return row;
				});

			const loadEntry = (name: string) =>
				Effect.gen(function* () {
					const row = yield* findReference(name);
					const noteRows =
						yield* sql`SELECT reference_name, path, content FROM note WHERE reference_name = ${name} ORDER BY path`;
					const notes = yield* decodeNoteRows(noteRows);
					return toEntry(
						row,
						notes.map((note) => ({ path: note.path, content: note.content })),
					);
				});

			/** Splits `name/sub/path` at the longest reference name that prefixes it. */
			const resolveNoteTarget = (fullPath: string) =>
				Effect.gen(function* () {
					const rows = yield* sql`SELECT name FROM reference
						WHERE name = ${fullPath} OR substr(${fullPath}, 1, length(name) + 1) = name || '/'
						ORDER BY length(name) DESC
						LIMIT 1`;
					const decoded = yield* decodeNames(rows);
					const match = decoded[0];
					if (match === undefined) {
						return yield* new ReferenceNotFound({ name: fullPath });
					}
					if (match.name === fullPath) return { name: match.name, path: "" };
					return {
						name: match.name,
						path: fullPath.slice(match.name.length + 1),
					};
				});

			const findNote = (target: { name: string; path: string }) =>
				Effect.gen(function* () {
					const rows =
						yield* sql`SELECT reference_name, path, content FROM note WHERE reference_name = ${target.name}`;
					const notes = yield* decodeNoteRows(rows);
					const note = notes.find((note) => note.path === target.path);
					if (note === undefined) {
						return yield* new NoteNotFound({
							name: target.name,
							path: target.path,
							available: notes.map((note) => note.path),
						});
					}
					return note;
				});

			const saveNote = (
				target: { name: string; path: string },
				content: string,
			) =>
				Effect.gen(function* () {
					yield* sql`INSERT INTO note (reference_name, path, content)
						VALUES (${target.name}, ${target.path}, ${content})
						ON CONFLICT (reference_name, path) DO UPDATE SET content = excluded.content`;
					yield* reindex([target.name]);
					return yield* loadEntry(target.name);
				});

			return {
				search: (keyword: string) =>
					Effect.gen(function* () {
						const rows =
							keyword.length >= minimumMatchLength
								? yield* sql`SELECT r.name, r.repo, r.domains
									FROM reference_search s JOIN reference r ON r.name = s.name
									WHERE reference_search MATCH ${ftsPhrase(keyword)}
									ORDER BY s.rank`
								: yield* sql`SELECT r.name, r.repo, r.domains
									FROM reference_search s JOIN reference r ON r.name = s.name
									WHERE s.name LIKE ${likePattern(keyword)} ESCAPE '\\'
										OR s.domains LIKE ${likePattern(keyword)} ESCAPE '\\'
										OR s.repo LIKE ${likePattern(keyword)} ESCAPE '\\'
										OR s.notes LIKE ${likePattern(keyword)} ESCAPE '\\'
									ORDER BY r.name`;
						const decoded = yield* decodeReferenceRows(rows);
						return decoded.map((row) => ({
							name: row.name,
							repo: row.repo === null ? undefined : row.repo,
							domains: row.domains,
						}));
					}),

				get: loadEntry,

				upsert: (name: string, entry: { domains: string[]; repo?: string }) =>
					Effect.gen(function* () {
						const domains = yield* encodeDomains(entry.domains);
						const repo = entry.repo === undefined ? null : entry.repo;
						yield* sql`INSERT INTO reference (name, repo, domains)
							VALUES (${name}, ${repo}, ${domains})
							ON CONFLICT (name) DO UPDATE SET repo = excluded.repo, domains = excluded.domains`;
						yield* reindex([name]);
						return yield* loadEntry(name);
					}).pipe(sql.withTransaction),

				readNote: (fullPath: string) =>
					Effect.gen(function* () {
						const target = yield* resolveNoteTarget(fullPath);
						const note = yield* findNote(target);
						return note.content;
					}),

				writeNote: (fullPath: string, content: string) =>
					Effect.gen(function* () {
						const target = yield* resolveNoteTarget(fullPath);
						return yield* saveNote(target, content);
					}).pipe(sql.withTransaction),

				editNote: (
					fullPath: string,
					oldString: string,
					newString: string,
					replaceAll: boolean,
				) =>
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
					}).pipe(sql.withTransaction),

				delete: (name: string) =>
					Effect.gen(function* () {
						yield* findReference(name);
						yield* sql`DELETE FROM note WHERE reference_name = ${name}`;
						yield* sql`DELETE FROM reference WHERE name = ${name}`;
						yield* sql`DELETE FROM reference_search WHERE name = ${name}`;
					}).pipe(sql.withTransaction),

				exportAll: Effect.gen(function* () {
					const referenceRows =
						yield* sql`SELECT name, repo, domains FROM reference ORDER BY name`;
					const rows = yield* decodeReferenceRows(referenceRows);
					const noteRows =
						yield* sql`SELECT reference_name, path, content FROM note ORDER BY reference_name, path`;
					const notes = yield* decodeNoteRows(noteRows);
					const references: Record<string, ReferenceEntry> = {};
					for (const row of rows) {
						references[row.name] = toEntry(
							row,
							notes
								.filter((note) => note.reference_name === row.name)
								.map((note) => ({ path: note.path, content: note.content })),
						);
					}
					const file: ReferencesFile = { references };
					return file;
				}),

				/** Upserts every reference in `file`, replacing its notes wholesale. */
				importAll: (file: ReferencesFile) =>
					Effect.gen(function* () {
						const names = Object.keys(file.references);
						if (names.length === 0) return 0;
						const referenceRows = yield* Effect.forEach(
							Object.entries(file.references),
							(pair) =>
								Effect.map(encodeDomains(pair[1].domains), (domains) => ({
									name: pair[0],
									repo: pair[1].repo === undefined ? null : pair[1].repo,
									domains,
								})),
						);
						const noteRows = Object.entries(file.references).flatMap((pair) =>
							pair[1].notes.map((note) => ({
								reference_name: pair[0],
								path: note.path,
								content: note.content,
							})),
						);
						yield* sql`DELETE FROM note WHERE reference_name IN ${sql.in(names)}`;
						yield* sql`INSERT INTO reference ${sql.insert(referenceRows)}
							ON CONFLICT (name) DO UPDATE SET repo = excluded.repo, domains = excluded.domains`;
						if (noteRows.length > 0) {
							yield* sql`INSERT INTO note ${sql.insert(noteRows)}`;
						}
						yield* reindex(names);
						return names.length;
					}).pipe(sql.withTransaction),
			};
		}),
	},
) {
	static layer = Layer.effect(ReferencesService, this.make);
}

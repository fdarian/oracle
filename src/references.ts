import {
	Config,
	Context,
	Effect,
	FileSystem,
	Layer,
	Path,
	Schema,
} from "effect";
import {
	NoteEditFailed,
	NoteNotFound,
	ReferenceNotFound,
	ReferencesFileParseError,
	ReferencesPathNotSet,
} from "#/errors.ts";

export const ReferenceNote = Schema.Struct({
	path: Schema.String,
	content: Schema.String,
});
export type ReferenceNote = typeof ReferenceNote.Type;

export const ReferenceEntry = Schema.Struct({
	domains: Schema.Array(Schema.String),
	repo: Schema.optional(Schema.String),
	notes: Schema.Array(ReferenceNote),
});
export type ReferenceEntry = typeof ReferenceEntry.Type;

export const ReferencesFile = Schema.Struct({
	references: Schema.Record(Schema.String, ReferenceEntry),
});
export type ReferencesFile = typeof ReferencesFile.Type;

const referencesFilePath = Effect.gen(function* () {
	return yield* Config.String("ORACLE_REFERENCES_PATH");
}).pipe(Effect.mapError(() => new ReferencesPathNotSet()));

const ReferencesFileFromJson = Schema.fromJsonString(ReferencesFile);
const encodeReferencesFile = Schema.encodeEffect(ReferencesFile);

function notePathMatches(fullPath: string, name: string) {
	return fullPath === name || fullPath.startsWith(`${name}/`);
}

function resolveNoteTarget(
	fullPath: string,
	references: ReferencesFile["references"],
) {
	const name = Object.keys(references)
		.filter((candidate) => notePathMatches(fullPath, candidate))
		.sort((left, right) => right.length - left.length)[0];
	if (name === undefined) return undefined;
	if (fullPath === name) return { name, path: "" };
	return { name, path: fullPath.slice(name.length + 1) };
}

function getAvailableNotePaths(entry: ReferenceEntry) {
	return entry.notes.map((note) => note.path);
}

function countOccurrences(content: string, oldString: string) {
	return content.split(oldString).length - 1;
}

export class ReferencesService extends Context.Service<ReferencesService>()(
	"oracle/ReferencesService",
	{
		make: Effect.gen(function* () {
			const fs = yield* FileSystem.FileSystem;
			const path = yield* Path.Path;

			const readAndDecode = (filePath: string) =>
				Effect.gen(function* () {
					const raw = yield* fs.readFileString(filePath);
					return yield* Schema.decodeEffect(ReferencesFileFromJson)(raw);
				}).pipe(
					Effect.mapError(
						(error) => new ReferencesFileParseError({ cause: error }),
					),
				);

			/**
			 * Reads the references file if it exists, otherwise returns the empty state. A
			 * parse failure of a file that DOES exist still surfaces as the tagged error —
			 * never masked.
			 */
			const loadReferencesFile = Effect.gen(function* () {
				const filePath = yield* referencesFilePath;
				const exists = yield* fs.exists(filePath);
				if (exists) {
					return yield* readAndDecode(filePath);
				}
				return { references: {} } as ReferencesFile;
			});

			const saveReferencesFile = (data: ReferencesFile) =>
				Effect.gen(function* () {
					const filePath = yield* referencesFilePath;
					const dir = path.dirname(filePath);
					yield* fs.makeDirectory(dir, { recursive: true });
					const encoded = yield* encodeReferencesFile(data);
					yield* fs.writeFileString(
						filePath,
						`${JSON.stringify(encoded, null, 2)}\n`,
					);
				});

			return {
				search: (keyword: string) =>
					Effect.gen(function* () {
						const file = yield* loadReferencesFile;
						const lower = keyword.toLowerCase();
						return Object.entries(file.references)
							.filter(([name, entry]) => {
								if (name.toLowerCase().includes(lower)) return true;
								if (entry.domains.some((d) => d.toLowerCase().includes(lower)))
									return true;
								if (entry.repo?.toLowerCase().includes(lower)) return true;
								if (
									entry.notes.some((note) =>
										note.content.toLowerCase().includes(lower),
									)
								)
									return true;
								return false;
							})
							.map(([name, entry]) => ({
								name,
								repo: entry.repo,
								domains: entry.domains,
							}));
					}),

				get: (name: string) =>
					Effect.gen(function* () {
						const file = yield* loadReferencesFile;
						const entry = file.references[name];
						if (entry === undefined) {
							return yield* new ReferenceNotFound({ name });
						}
						return entry;
					}),

				upsert: (name: string, entry: { domains: string[]; repo?: string }) =>
					Effect.gen(function* () {
						const file = yield* loadReferencesFile;
						const existing = file.references[name];
						const notes = existing === undefined ? [] : existing.notes;
						const updated: ReferencesFile = {
							references: {
								...file.references,
								[name]: {
									domains: entry.domains,
									repo: entry.repo,
									notes,
								},
							},
						};
						yield* saveReferencesFile(updated);
						return updated.references[name] as ReferenceEntry;
					}),

				readNote: (fullPath: string) =>
					Effect.gen(function* () {
						const file = yield* loadReferencesFile;
						const target = resolveNoteTarget(fullPath, file.references);
						if (target === undefined) {
							return yield* new ReferenceNotFound({ name: fullPath });
						}
						const entry = file.references[target.name];
						if (entry === undefined) {
							return yield* new ReferenceNotFound({ name: target.name });
						}
						const note = entry.notes.find((note) => note.path === target.path);
						if (note === undefined) {
							return yield* new NoteNotFound({
								name: target.name,
								path: target.path,
								available: getAvailableNotePaths(entry),
							});
						}
						return note.content;
					}),

				writeNote: (fullPath: string, content: string) =>
					Effect.gen(function* () {
						const file = yield* loadReferencesFile;
						const target = resolveNoteTarget(fullPath, file.references);
						if (target === undefined) {
							return yield* new ReferenceNotFound({ name: fullPath });
						}
						const entry = file.references[target.name];
						if (entry === undefined) {
							return yield* new ReferenceNotFound({ name: target.name });
						}
						const existing = entry.notes.find(
							(note) => note.path === target.path,
						);
						const notes =
							existing === undefined
								? [...entry.notes, { path: target.path, content }]
								: entry.notes.map((note) =>
										note.path === target.path
											? { path: target.path, content }
											: note,
									);
						const updatedEntry: ReferenceEntry = { ...entry, notes };
						yield* saveReferencesFile({
							references: {
								...file.references,
								[target.name]: updatedEntry,
							},
						});
						return updatedEntry;
					}),

				editNote: (
					fullPath: string,
					oldString: string,
					newString: string,
					replaceAll: boolean,
				) =>
					Effect.gen(function* () {
						const file = yield* loadReferencesFile;
						const target = resolveNoteTarget(fullPath, file.references);
						if (target === undefined) {
							return yield* new ReferenceNotFound({ name: fullPath });
						}
						const entry = file.references[target.name];
						if (entry === undefined) {
							return yield* new ReferenceNotFound({ name: target.name });
						}
						const note = entry.notes.find((note) => note.path === target.path);
						if (note === undefined) {
							return yield* new NoteNotFound({
								name: target.name,
								path: target.path,
								available: getAvailableNotePaths(entry),
							});
						}
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
						const notes = entry.notes.map((note) =>
							note.path === target.path ? { path: target.path, content } : note,
						);
						const updatedEntry: ReferenceEntry = { ...entry, notes };
						yield* saveReferencesFile({
							references: {
								...file.references,
								[target.name]: updatedEntry,
							},
						});
						return updatedEntry;
					}),

				delete: (name: string) =>
					Effect.gen(function* () {
						const file = yield* loadReferencesFile;
						if (file.references[name] === undefined) {
							return yield* new ReferenceNotFound({ name });
						}
						const remaining = { ...file.references };
						delete remaining[name];
						yield* saveReferencesFile({ references: remaining });
					}),
			};
		}),
	},
) {
	static layer = Layer.effect(ReferencesService, this.make);
}

import { Console, Effect, Schema } from "effect";
import { Argument, Command } from "effect/cli";
import { DatabaseLayer } from "#/database.ts";
import { ReferencesFileParseError } from "#/errors.ts";
import { ReferencesFile, ReferencesService } from "#/references.ts";

const decodeReferencesFile = Schema.decodeUnknownEffect(
	Schema.fromJsonString(ReferencesFile),
);

export const importCommand = Command.make(
	"import",
	{
		file: Argument.FileText("references.json").pipe(
			Argument.withDescription("A references.json file from the old store"),
		),
	},
	(args) =>
		Effect.gen(function* () {
			const file = yield* decodeReferencesFile(args.file).pipe(
				Effect.mapError((cause) => new ReferencesFileParseError({ cause })),
			);
			const refs = yield* ReferencesService;
			const count = yield* refs.importAll(file);
			yield* Console.log(`Imported ${count} references.`);
		}).pipe(
			Effect.provide(ReferencesService.layer),
			Effect.provide(DatabaseLayer),
		),
).pipe(
	Command.withDescription("Import references from a references.json file"),
);

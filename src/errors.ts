import { Schema } from "effect";

export class ReferenceNotFound extends Schema.TaggedError<ReferenceNotFound>()(
	"ReferenceNotFound",
	{
		name: Schema.String,
	},
) {}

export class NoteNotFound extends Schema.TaggedError<NoteNotFound>()(
	"NoteNotFound",
	{
		name: Schema.String,
		path: Schema.String,
		available: Schema.Array(Schema.String),
	},
) {}

export class NoteEditFailed extends Schema.TaggedError<NoteEditFailed>()(
	"NoteEditFailed",
	{
		path: Schema.String,
		reason: Schema.String,
	},
) {}

export class InvalidRepoFormat extends Schema.TaggedError<InvalidRepoFormat>()(
	"InvalidRepoFormat",
	{
		input: Schema.String,
	},
) {}

export class GitCloneFailed extends Schema.TaggedError<GitCloneFailed>()(
	"GitCloneFailed",
	{
		repo: Schema.String,
		exitCode: Schema.Number,
	},
) {}

export class ReferencesFileParseError extends Schema.TaggedError<ReferencesFileParseError>()(
	"ReferencesFileParseError",
	{
		cause: Schema.Unknown,
	},
) {}

export class ReferencesPathNotSet extends Schema.TaggedError<ReferencesPathNotSet>()(
	"ReferencesPathNotSet",
	{},
) {
	override get message() {
		return "ORACLE_REFERENCES_PATH is not set. Set it to the absolute path of the references.json file.";
	}
}

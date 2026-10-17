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
		cause: Schema.Defect(),
	},
) {
	override get message() {
		return `Not a valid references.json file: ${String(this.cause)}`;
	}
}

export class DatabasePathNotSet extends Schema.TaggedError<DatabasePathNotSet>()(
	"DatabasePathNotSet",
	{},
) {
	override get message() {
		return "ORACLE_DB_PATH is not set. Set it to the absolute path of the oracle database file.";
	}
}

export class ReplicaNotInitialized extends Schema.TaggedError<ReplicaNotInitialized>()(
	"ReplicaNotInitialized",
	{
		path: Schema.String,
	},
) {
	override get message() {
		return `${this.path} is a local-only database but ORACLE_SYNC_URL is set. Run \`oracle sync enable\` to copy it to the remote and turn it into a replica.`;
	}
}

export class ReplicaNeedsSyncUrl extends Schema.TaggedError<ReplicaNeedsSyncUrl>()(
	"ReplicaNeedsSyncUrl",
	{
		path: Schema.String,
	},
) {
	override get message() {
		return `${this.path} is a synced replica but ORACLE_SYNC_URL is not set. Set ORACLE_SYNC_URL (and ORACLE_SYNC_TOKEN) to the server it syncs with.`;
	}
}

export class SyncFailed extends Schema.TaggedError<SyncFailed>()("SyncFailed", {
	url: Schema.String,
	cause: Schema.Defect(),
}) {
	override get message() {
		return `Could not sync with ${this.url}: ${String(this.cause)}. A synced database can't open while its server is unreachable.`;
	}
}

export class SyncUrlNotSet extends Schema.TaggedError<SyncUrlNotSet>()(
	"SyncUrlNotSet",
	{},
) {
	override get message() {
		return "ORACLE_SYNC_URL is not set. Set it (and ORACLE_SYNC_TOKEN if the server needs one) to the libSQL server to sync with.";
	}
}

export class BackupExists extends Schema.TaggedError<BackupExists>()(
	"BackupExists",
	{
		path: Schema.String,
	},
) {
	override get message() {
		return `${this.path} already exists. Move it away before enabling sync again.`;
	}
}

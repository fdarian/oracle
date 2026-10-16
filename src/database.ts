import { LibsqlClient, LibsqlMigrator } from "@effect/sql-libsql";
import { type Client, createClient } from "@libsql/client";
import {
	Config,
	Effect,
	FileSystem,
	Layer,
	Option,
	Path,
	Redacted,
} from "effect";
import { SqlClient } from "effect/sql";
import {
	DatabasePathNotSet,
	ReplicaNeedsSyncUrl,
	ReplicaNotInitialized,
	SyncFailed,
} from "#/errors.ts";

export const DatabaseConfig = Effect.gen(function* () {
	const path = yield* Config.String("ORACLE_DB_PATH").pipe(
		Effect.mapError(() => new DatabasePathNotSet()),
	);
	const syncUrl = yield* Config.option(Config.String("ORACLE_SYNC_URL"));
	const syncToken = yield* Config.option(Config.Redacted("ORACLE_SYNC_TOKEN"));
	return { path, syncUrl, syncToken };
});

/** Sidecar file libSQL writes next to an embedded replica; a local-only database has none. */
export const replicaIndexPath = (dbPath: string) =>
	`${dbPath}-client_wal_index`;

const migrations = LibsqlMigrator.run({
	loader: LibsqlMigrator.fromRecord({
		"0001_init": Effect.gen(function* () {
			const sql = yield* SqlClient.SqlClient;
			yield* sql`CREATE TABLE reference (
				name TEXT PRIMARY KEY,
				repo TEXT,
				domains TEXT NOT NULL
			) STRICT`;
			yield* sql`CREATE TABLE note (
				reference_name TEXT NOT NULL,
				path TEXT NOT NULL,
				content TEXT NOT NULL,
				PRIMARY KEY (reference_name, path)
			) STRICT`;
			// Trigram keeps the old case-insensitive substring semantics while adding bm25 ranking.
			yield* sql`CREATE VIRTUAL TABLE reference_search USING fts5(
				name, domains, repo, notes,
				tokenize = 'trigram'
			)`;
		}),
	}),
});

const withMigrations = (
	layer: Layer.Layer<LibsqlClient.LibsqlClient | SqlClient.SqlClient>,
) => Layer.effectDiscard(migrations).pipe(Layer.provideMerge(layer));

/** A migrated SQL client for a single URL: a local `file:` or a remote server, no replica. */
export const sqlLayer = (options: {
	url: string;
	authToken?: Redacted.Redacted;
}) =>
	withMigrations(
		LibsqlClient.layer({ url: options.url, authToken: options.authToken }),
	);

type DatabaseConfig = Effect.Success<typeof DatabaseConfig>;

/** An embedded replica connects to its remote on creation, so this fails when the remote is unreachable. */
const openReplica = (config: DatabaseConfig, url: string) =>
	Effect.acquireRelease(
		Effect.try({
			try: () =>
				createClient({
					url: `file:${config.path}`,
					syncUrl: url,
					authToken: Option.getOrUndefined(
						Option.map(config.syncToken, Redacted.value),
					),
				}),
			catch: (cause) => new SyncFailed({ url, cause }),
		}),
		(client) => Effect.sync(() => client.close()),
	);

const syncReplica = (client: Client, url: string) =>
	Effect.tryPromise({
		try: () => client.sync(),
		catch: (cause) => new SyncFailed({ url, cause }),
	});

/** Creates a fresh replica at `ORACLE_DB_PATH` and pulls the remote into it. */
export const bootstrapReplica = (config: DatabaseConfig, url: string) =>
	openReplica(config, url).pipe(
		Effect.flatMap((client) => syncReplica(client, url)),
		Effect.scoped,
	);

/**
 * Opens `ORACLE_DB_PATH` as a plain local file, or as an embedded replica of
 * `ORACLE_SYNC_URL` when set. Replica reads are local, writes go to the remote,
 * and startup pulls the latest state.
 */
export const DatabaseLayer = Layer.unwrap(
	Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;
		const path = yield* Path.Path;
		const config = yield* DatabaseConfig;
		yield* fs.makeDirectory(path.dirname(config.path), { recursive: true });

		const dbExists = yield* fs.exists(config.path);
		const isReplica = yield* fs.exists(replicaIndexPath(config.path));
		if (Option.isNone(config.syncUrl)) {
			// Writing to a replica without its remote would fork it from the primary.
			if (isReplica)
				return yield* new ReplicaNeedsSyncUrl({ path: config.path });
			return sqlLayer({ url: `file:${config.path}` });
		}
		if (dbExists && !isReplica) {
			return yield* new ReplicaNotInitialized({ path: config.path });
		}

		const client = yield* openReplica(config, config.syncUrl.value);
		yield* syncReplica(client, config.syncUrl.value);
		return withMigrations(LibsqlClient.layer({ liveClient: client }));
	}),
);

import { LibsqlClient } from "@effect/sql-libsql";
import { type Client, createClient } from "@libsql/client";
import { applyEmbeddedMigrations } from "deskkit/sqlite";
import * as LibsqlDrizzle from "drizzle-orm/effect-libsql";
import {
	Config,
	Context,
	Effect,
	FileSystem,
	Layer,
	Option,
	Path,
	Redacted,
} from "effect";
import {
	DatabasePathNotSet,
	ReplicaNeedsSyncUrl,
	ReplicaNotInitialized,
	SyncFailed,
} from "#/errors.ts";
import migrationBundle from "../.gen/migrations.gen.ts";

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

export class Database extends Context.Service<Database>()("oracle/Database", {
	make: Effect.gen(function* () {
		const db = yield* LibsqlDrizzle.makeWithDefaults();
		yield* applyEmbeddedMigrations(db, migrationBundle);
		return db;
	}),
}) {}

const fromClient = (layer: Layer.Layer<LibsqlClient.LibsqlClient>) =>
	Layer.effect(Database, Database.make).pipe(Layer.provide(layer));

/** A migrated database for a single URL: a local `file:` or a remote server, no replica. */
export const databaseAt = (options: {
	url: string;
	authToken?: Redacted.Redacted;
}) =>
	fromClient(
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
			return databaseAt({ url: `file:${config.path}` });
		}
		if (dbExists && !isReplica) {
			return yield* new ReplicaNotInitialized({ path: config.path });
		}

		const client = yield* openReplica(config, config.syncUrl.value);
		yield* syncReplica(client, config.syncUrl.value);
		return fromClient(LibsqlClient.layer({ liveClient: client }));
	}),
);

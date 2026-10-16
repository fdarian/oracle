import { Console, Effect, FileSystem, Layer, Option } from "effect";
import { Command } from "effect/cli";
import {
	bootstrapReplica,
	DatabaseConfig,
	replicaIndexPath,
	sqlLayer,
} from "#/database.ts";
import { BackupExists, SyncUrlNotSet } from "#/errors.ts";
import { ReferencesService } from "#/references.ts";

const sqliteSidecars = ["", "-wal", "-shm"];

/**
 * Copies the local-only database to `ORACLE_SYNC_URL`, moves the local file
 * aside, and bootstraps a fresh embedded replica in its place. Copying rows
 * rather than the file keeps this working for any libSQL server, and a fresh
 * replica avoids libSQL refusing to sync a file it didn't create.
 */
export const enable = Command.make("enable", {}, () =>
	Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;
		const config = yield* DatabaseConfig;
		if (Option.isNone(config.syncUrl)) {
			return yield* new SyncUrlNotSet();
		}
		const syncUrl = config.syncUrl.value;
		const authToken = Option.getOrUndefined(config.syncToken);

		if (yield* fs.exists(replicaIndexPath(config.path))) {
			yield* Console.log(`${config.path} already syncs with ${syncUrl}.`);
			return;
		}

		const hasLocal = yield* fs.exists(config.path);
		if (hasLocal) {
			const backupPath = `${config.path}.bak`;
			if (yield* fs.exists(backupPath)) {
				return yield* new BackupExists({ path: backupPath });
			}

			const snapshot = yield* Effect.gen(function* () {
				const refs = yield* ReferencesService;
				return yield* refs.exportAll;
			}).pipe(
				Effect.provide(
					ReferencesService.layer.pipe(
						Layer.provide(sqlLayer({ url: `file:${config.path}` })),
					),
					{ local: true },
				),
			);

			const copied = yield* Effect.gen(function* () {
				const refs = yield* ReferencesService;
				return yield* refs.importAll(snapshot);
			}).pipe(
				Effect.provide(
					ReferencesService.layer.pipe(
						Layer.provide(sqlLayer({ url: syncUrl, authToken })),
					),
					{ local: true },
				),
			);
			yield* Console.log(`Copied ${copied} references to ${syncUrl}.`);

			for (const suffix of sqliteSidecars) {
				const source = `${config.path}${suffix}`;
				if (yield* fs.exists(source)) {
					yield* fs.rename(source, `${backupPath}${suffix}`);
				}
			}
			yield* Console.log(`Moved the local-only database to ${backupPath}.`);
		}

		yield* bootstrapReplica(config, syncUrl);
		yield* Console.log(`${config.path} is now a replica of ${syncUrl}.`);
	}),
).pipe(
	Command.withDescription(
		"Copy the local database to ORACLE_SYNC_URL and turn it into a synced replica",
	),
);

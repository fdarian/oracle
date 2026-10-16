import os from "node:os";
import { Context, Effect, FileSystem, Layer, Path } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import { GitCloneFailed, InvalidRepoFormat } from "#/errors.ts";

const parseRepo = (repo: string) =>
	Effect.gen(function* () {
		const parts = repo.split("/");
		if (parts.length !== 2 || parts[0] === "" || parts[1] === "") {
			return yield* Effect.fail(new InvalidRepoFormat({ input: repo }));
		}
		return { org: parts[0] as string, name: parts[1] as string };
	});

const gitRevParse = (dest: string, arg: string) =>
	Effect.gen(function* () {
		const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
		const cmd = ChildProcess.make("git", ["-C", dest, "rev-parse", arg]);
		return (yield* spawner.string(cmd)).trim();
	});

export class ReposService extends Context.Service<ReposService>()(
	"oracle/ReposService",
	{
		make: Effect.gen(function* () {
			const fs = yield* FileSystem.FileSystem;
			const path = yield* Path.Path;

			return {
				getRepoPath: (repo: string) =>
					Effect.gen(function* () {
						const parsed = yield* parseRepo(repo);
						const dest = path.join(
							os.tmpdir(),
							"github",
							parsed.org,
							parsed.name,
						);
						const exists = yield* fs.exists(dest);
						if (!exists) {
							const cloneUrl = `https://github.com/${parsed.org}/${parsed.name}.git`;
							const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
							const cloneCmd = ChildProcess.make("git", [
								"clone",
								"--depth",
								"1",
								cloneUrl,
								dest,
							]);
							const exitCode = yield* spawner.exitCode(cloneCmd);
							if (exitCode !== 0) {
								return yield* new GitCloneFailed({ repo, exitCode });
							}
						}
						const head = yield* gitRevParse(dest, "HEAD");
						const branch = yield* gitRevParse(dest, "--abbrev-ref HEAD");
						return { path: dest, head, branch, cloned: !exists };
					}),
			};
		}),
	},
) {
	static layer = Layer.effect(ReposService, this.make);
}

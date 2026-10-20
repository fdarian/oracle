import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

const hostNativePackage = () => {
	const platform = process.platform;
	const arch = process.arch;
	if (platform === "darwin") return `darwin-${arch}`;
	if (platform === "win32" && arch === "x64") return "win32-x64-msvc";
	if (platform === "linux") {
		const report = process.report.getReport() as {
			header: { glibcVersionRuntime?: string };
		};
		const libc = report.header.glibcVersionRuntime ? "gnu" : "musl";
		return `linux-${arch}-${libc}`;
	}
	throw new Error(`no libsql native package for ${platform}-${arch}`);
};

/**
 * libsql picks its native addon with a template-string `require`, which
 * `bun build --compile` can't follow, so the addon would be missing from the
 * binary. Pin the require to the package for this host, so binaries are built
 * per platform, not cross-compiled.
 */
const pinLibsqlNative = {
	name: "pin-libsql-native",
	setup(build: Bun.PluginBuilder) {
		build.onLoad({ filter: /[\\/]libsql[\\/]index\.js$/ }, async (args) => {
			const native = hostNativePackage();
			const nativePath = join(dirname(dirname(args.path)), "@libsql", native);
			if (!existsSync(nativePath)) {
				throw new Error(`@libsql/${native} is not installed`);
			}
			const source = await Bun.file(args.path).text();
			// Split so Biome's noTemplateCurlyInString doesn't flag the literal.
			const dynamicRequire = "require(`@libsql/$" + "{target}`)";
			if (!source.includes(dynamicRequire)) {
				throw new Error(`libsql loader changed, update ${import.meta.path}`);
			}
			return {
				contents: source.replace(
					dynamicRequire,
					`require("@libsql/${native}")`,
				),
				loader: "js",
			};
		});
	},
};

const result = await Bun.build({
	entrypoints: ["entries/cli.ts"],
	compile: { outfile: "dist/oracle" },
	plugins: [pinLibsqlNative],
});

if (!result.success) {
	for (const log of result.logs) console.error(log);
	process.exit(1);
}

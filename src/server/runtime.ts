import { BunServices } from "@effect/platform-bun";
import { Layer, ManagedRuntime } from "effect";
import { DatabaseLayer } from "#/database.ts";
import { ReferencesService } from "#/references.ts";
import { ReposService } from "#/repos.ts";

const layerMain = Layer.mergeAll(
	ReferencesService.layer.pipe(Layer.provide(DatabaseLayer)),
	ReposService.layer,
).pipe(Layer.provideMerge(BunServices.layer));
export type RuntimeServices = Layer.Success<typeof layerMain>;

export const runtime = ManagedRuntime.make(layerMain);

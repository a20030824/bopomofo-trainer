import type { ReferenceSourceManifest } from "./types.js";

export function createReferenceSourceRegistry(
  manifests: readonly ReferenceSourceManifest[],
): Readonly<Record<string, ReferenceSourceManifest>> {
  const registry: Record<string, ReferenceSourceManifest> = {};
  for (const manifest of manifests) {
    if (manifest.id.trim().length === 0) {
      throw new Error("reference source id must not be empty");
    }
    if (registry[manifest.id] !== undefined) {
      throw new Error(`duplicate reference source id: ${manifest.id}`);
    }
    registry[manifest.id] = manifest;
  }
  return Object.fromEntries(
    Object.entries(registry).sort(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0,
    ),
  );
}

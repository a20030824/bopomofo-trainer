import { readFile } from "node:fs/promises";
import { parseCsv } from "../src/catalog/csv.js";
import {
  acceptReviewedCatalogReadings,
  resolveCatalogReadings,
  type CatalogReadingResolutionResult,
} from "../src/readings/catalog-resolution.js";

export type CatalogSourceLocation = string | URL;

export interface ResolvedCatalogSourcePaths {
  words: CatalogSourceLocation;
  concised: CatalogSourceLocation;
  revised: CatalogSourceLocation;
  cedict: CatalogSourceLocation;
  manual: CatalogSourceLocation;
}

export const DEFAULT_RESOLVED_CATALOG_SOURCE_PATHS: ResolvedCatalogSourcePaths = {
  words: new URL("../data/source/words.sample.csv", import.meta.url),
  concised: new URL(
    "../data/readings/moe-concised-2014_20260626-active-catalog.json",
    import.meta.url,
  ),
  revised: new URL(
    "../data/readings/moe-revised-2015_20260625-active-catalog-fallback.json",
    import.meta.url,
  ),
  cedict: new URL(
    "../data/identity/cedict-active-catalog-hints.json",
    import.meta.url,
  ),
  manual: new URL(
    "../data/readings/manual-reading-overrides.json",
    import.meta.url,
  ),
};

export async function loadResolvedCatalogSource(
  paths: Partial<ResolvedCatalogSourcePaths> = {},
): Promise<CatalogReadingResolutionResult> {
  const resolvedPaths = { ...DEFAULT_RESOLVED_CATALOG_SOURCE_PATHS, ...paths };
  const words = await readFile(resolvedPaths.words, "utf8");
  const catalogRecords = parseCsv(words).records;
  const reviewed = acceptReviewedCatalogReadings(catalogRecords);
  if (reviewed !== null) return reviewed;
  const [concised, revised, cedict, manual] = await Promise.all([
    readFile(resolvedPaths.concised, "utf8"),
    readFile(resolvedPaths.revised, "utf8"),
    readFile(resolvedPaths.cedict, "utf8"),
    readFile(resolvedPaths.manual, "utf8"),
  ]);
  return resolveCatalogReadings({
    catalogRecords,
    moeConcisedProjection: JSON.parse(concised) as unknown,
    moeRevisedProjection: JSON.parse(revised) as unknown,
    cedictProjection: JSON.parse(cedict) as unknown,
    manualOverrides: JSON.parse(manual) as unknown,
  });
}

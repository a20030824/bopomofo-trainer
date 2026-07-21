import { readFile } from "node:fs/promises";
import { parseCsv } from "../src/catalog/csv.js";
import {
  resolveCatalogReadings,
  type CatalogReadingResolutionResult,
} from "../src/readings/catalog-resolution.js";

const wordsUrl = new URL("../data/source/words.sample.csv", import.meta.url);
const concisedUrl = new URL(
  "../data/readings/moe-concised-2014_20260626-active-catalog.json",
  import.meta.url,
);
const revisedUrl = new URL(
  "../data/readings/moe-revised-2015_20260625-active-catalog-fallback.json",
  import.meta.url,
);
const cedictUrl = new URL(
  "../data/identity/cedict-active-catalog-hints.json",
  import.meta.url,
);
const manualUrl = new URL(
  "../data/readings/manual-reading-overrides.json",
  import.meta.url,
);

export async function loadResolvedCatalogSource(): Promise<CatalogReadingResolutionResult> {
  const [words, concised, revised, cedict, manual] = await Promise.all([
    readFile(wordsUrl, "utf8"),
    readFile(concisedUrl, "utf8"),
    readFile(revisedUrl, "utf8"),
    readFile(cedictUrl, "utf8"),
    readFile(manualUrl, "utf8"),
  ]);
  return resolveCatalogReadings({
    catalogRecords: parseCsv(words).records,
    moeConcisedProjection: JSON.parse(concised) as unknown,
    moeRevisedProjection: JSON.parse(revised) as unknown,
    cedictProjection: JSON.parse(cedict) as unknown,
    manualOverrides: JSON.parse(manual) as unknown,
  });
}

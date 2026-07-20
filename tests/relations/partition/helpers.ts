import { readFile } from "node:fs/promises";
import { compileCatalog } from "../../../src/catalog/compile-catalog.js";
import { parseCsv } from "../../../src/catalog/csv.js";
import { createProvenanceRegistry } from "../../../src/catalog/provenance.js";
import type { CatalogEntry } from "../../../src/core/model.js";
import { createRelationalCatalogReport } from "../../../src/relations/catalog-report.js";
import type { PartitionInput } from "../../../src/relations/partition/types.js";
import type { CatalogPartition } from "../../../src/relations/types.js";
import { STANDARD_BOPOMOFO_LAYOUT } from "../../../src/scheme/standard-layout.js";

export function createPartitionInput(entries: readonly CatalogEntry[]): PartitionInput {
  const partitionByEntryId = Object.fromEntries(
    entries.map((entry) => [entry.id, "training"] as const),
  ) as Readonly<Record<string, CatalogPartition>>;
  const report = createRelationalCatalogReport(entries, {
    mode: "guided",
    layoutId: STANDARD_BOPOMOFO_LAYOUT.id,
    partitionByEntryId,
  });
  return { entries, index: report.index, report };
}

export async function readPartitionFixture(
  name: "feasible" | "infeasible",
): Promise<readonly CatalogEntry[]> {
  const source = await readFile(
    new URL(`../../../data/fixtures/partition/${name}.json`, import.meta.url),
    "utf8",
  );
  return JSON.parse(source) as readonly CatalogEntry[];
}

export async function compileRealCatalog(): Promise<readonly CatalogEntry[]> {
  const [source, provenanceSource] = await Promise.all([
    readFile(new URL("../../../data/source/words.sample.csv", import.meta.url), "utf8"),
    readFile(new URL("../../../data/provenance.csv", import.meta.url), "utf8"),
  ]);
  const provenance = createProvenanceRegistry(parseCsv(provenanceSource).records);
  if (provenance.errors.length > 0) {
    throw new Error(provenance.errors.map((error) => error.message).join("; "));
  }
  const compiled = compileCatalog(parseCsv(source).records, provenance.ids);
  if (compiled.errors.length > 0) {
    throw new Error(compiled.errors.map((error) => error.message).join("; "));
  }
  return compiled.entries;
}

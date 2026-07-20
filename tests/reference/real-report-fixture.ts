import { readFile } from "node:fs/promises";
import { compileCatalog } from "../../src/catalog/compile-catalog.js";
import { parseCsv } from "../../src/catalog/csv.js";
import { createProvenanceRegistry } from "../../src/catalog/provenance.js";
import { partitionCatalogForProduct } from "../../src/product/catalog-partition.js";
import { semanticReferenceIdentity } from "../../src/reference/identity.js";
import { createRelationalCatalogReport } from "../../src/relations/catalog-report.js";
import { STANDARD_BOPOMOFO_LAYOUT } from "../../src/scheme/standard-layout.js";

export async function createRealReferenceFixture() {
  const [source, provenanceSource] = await Promise.all([
    readFile(new URL("../../data/source/words.sample.csv", import.meta.url), "utf8"),
    readFile(new URL("../../data/provenance.csv", import.meta.url), "utf8"),
  ]);
  const provenance = createProvenanceRegistry(parseCsv(provenanceSource).records);
  if (provenance.errors.length > 0) throw new Error("invalid provenance fixture");
  const compiled = compileCatalog(parseCsv(source).records, provenance.ids);
  if (compiled.errors.length > 0) throw new Error("invalid catalog fixture");
  const partition = partitionCatalogForProduct(compiled.entries, 5, 3);
  const evaluationIds = new Set(partition.evaluation.map((entry) => entry.id));
  const report = createRelationalCatalogReport(compiled.entries, {
    mode: "guided",
    layoutId: STANDARD_BOPOMOFO_LAYOUT.id,
    partitionByEntryId: Object.fromEntries(compiled.entries.map((entry) => [
      entry.id,
      evaluationIds.has(entry.id) ? "evaluation" : "training",
    ] as const)),
  });
  const reviewedIdentities = new Set(compiled.entries.map((entry) =>
    semanticReferenceIdentity(entry.prompt.text, entry.syllables),
  ));
  return { report, reviewedIdentities };
}

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { compileCatalog } from "../src/catalog/compile-catalog.js";
import { parseCsv } from "../src/catalog/csv.js";
import { createProvenanceRegistry } from "../src/catalog/provenance.js";
import { partitionCatalogForProduct } from "../src/product/catalog-partition.js";
import { createRelationalCatalogReport } from "../src/relations/catalog-report.js";
import { formatRelationalCatalogReport } from "../src/relations/catalog-report-text.js";
import { STANDARD_BOPOMOFO_LAYOUT } from "../src/scheme/standard-layout.js";

const sourceUrl = new URL("../data/source/words.sample.csv", import.meta.url);
const provenanceUrl = new URL("../data/provenance.csv", import.meta.url);
const outputUrl = new URL("../data/generated/", import.meta.url);
const [source, provenanceSource] = await Promise.all([
  readFile(sourceUrl, "utf8"),
  readFile(provenanceUrl, "utf8"),
]);

const provenance = createProvenanceRegistry(parseCsv(provenanceSource).records);
if (provenance.errors.length > 0) {
  for (const error of provenance.errors) {
    console.error(`provenance row ${error.rowNumber}: ${error.message}`);
  }
  process.exitCode = 1;
} else {
  const compiled = compileCatalog(parseCsv(source).records, provenance.ids);
  if (compiled.errors.length > 0) {
    for (const error of compiled.errors) {
      console.error(`row ${error.rowNumber}: ${error.message}`);
    }
    process.exitCode = 1;
  } else {
    const partition = partitionCatalogForProduct(compiled.entries);
    const evaluationIds = new Set(partition.evaluation.map((entry) => entry.id));
    const partitionByEntryId = Object.fromEntries(
      compiled.entries.map((entry) => [
        entry.id,
        evaluationIds.has(entry.id) ? "evaluation" : "training",
      ] as const),
    );
    const report = createRelationalCatalogReport(compiled.entries, {
      mode: "guided",
      layoutId: STANDARD_BOPOMOFO_LAYOUT.id,
      partitionByEntryId,
    });
    const text = formatRelationalCatalogReport(report);

    await mkdir(outputUrl, { recursive: true });
    await Promise.all([
      writeFile(
        new URL("relational-catalog.json", outputUrl),
        `${JSON.stringify(report, null, 2)}\n`,
      ),
      writeFile(new URL("relational-catalog.txt", outputUrl), text),
    ]);
    process.stdout.write(text);
  }
}

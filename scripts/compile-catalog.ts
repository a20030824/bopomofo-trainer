import { mkdir, readFile, writeFile } from "node:fs/promises";
import { compileCatalog } from "../src/catalog/compile-catalog.js";
import { createCoverageReport } from "../src/catalog/coverage.js";
import { parseCsv } from "../src/catalog/csv.js";
import { createProvenanceRegistry } from "../src/catalog/provenance.js";
import { loadResolvedCatalogSource } from "./load-resolved-catalog-source.js";

const provenanceUrl = new URL("../data/provenance.csv", import.meta.url);
const outputUrl = new URL("../data/generated/", import.meta.url);
const [resolvedSource, provenanceSource] = await Promise.all([
  loadResolvedCatalogSource(),
  readFile(provenanceUrl, "utf8"),
]);

const provenance = createProvenanceRegistry(parseCsv(provenanceSource).records);
if (provenance.errors.length > 0) {
  for (const error of provenance.errors) {
    console.error(`provenance row ${error.rowNumber}: ${error.message}`);
  }
  process.exitCode = 1;
} else {
  const result = compileCatalog(resolvedSource.records, provenance.ids);
  if (result.errors.length > 0) {
    for (const error of result.errors) {
      console.error(`row ${error.rowNumber}: ${error.message}`);
    }
    process.exitCode = 1;
  } else {
    await mkdir(outputUrl, { recursive: true });
    const coverage = createCoverageReport(result.entries);
    await Promise.all([
      writeFile(new URL("catalog.json", outputUrl), `${JSON.stringify(result.entries, null, 2)}\n`),
      writeFile(new URL("coverage.json", outputUrl), `${JSON.stringify(coverage, null, 2)}\n`),
      writeFile(
        new URL("reading-resolution.json", outputUrl),
        `${JSON.stringify(resolvedSource.report, null, 2)}\n`,
      ),
    ]);
    console.log(
      `wrote ${result.entries.length} entries; reading sources: ${JSON.stringify(resolvedSource.report.counts)}; changed ${resolvedSource.report.changedTexts.length} provisional readings`,
    );
  }
}

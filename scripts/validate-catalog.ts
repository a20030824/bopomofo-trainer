import { readFile } from "node:fs/promises";
import { compileCatalog } from "../src/catalog/compile-catalog.js";
import { createCoverageReport } from "../src/catalog/coverage.js";
import { parseCsv } from "../src/catalog/csv.js";
import { createProvenanceRegistry } from "../src/catalog/provenance.js";
import { loadResolvedCatalogSource } from "./load-resolved-catalog-source.js";

const [resolvedSource, provenanceSource] = await Promise.all([
  loadResolvedCatalogSource(),
  readFile(new URL("../data/provenance.csv", import.meta.url), "utf8"),
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
    const coverage = createCoverageReport(result.entries);
    console.log(`catalog valid: ${coverage.entryCount} entries, ${coverage.syllableCount} syllables`);
    console.log(`covered tokens: ${coverage.tokenCoverage.length}`);
    console.log(
      `reading resolution ${resolvedSource.report.determinismDigest}: ${JSON.stringify(resolvedSource.report.counts)}`,
    );
  }
}

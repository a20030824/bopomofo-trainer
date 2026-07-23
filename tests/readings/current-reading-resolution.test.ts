import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { compileCatalog } from "../../src/catalog/compile-catalog.js";
import { parseCsv } from "../../src/catalog/csv.js";
import { createProvenanceRegistry } from "../../src/catalog/provenance.js";
import { loadResolvedCatalogSource } from "../../scripts/load-resolved-catalog-source.js";

describe("current catalog reading resolution", () => {
  it("accepts every reviewed active-catalog row as one reading identity", async () => {
    const result = await loadResolvedCatalogSource();

    expect(result.report.candidateCount).toBe(result.records.length);
    expect(
      Object.values(result.report.counts).reduce((total, count) => total + count, 0),
    ).toBe(result.report.candidateCount);
    expect(result.report.changedTexts).toEqual([]);
    expect(result.report.counts).toEqual({
      "reviewed-catalog": result.report.candidateCount,
    });
    expect(result.report.rows.every((row) =>
      row.sourceKind === "reviewed-catalog"
      && row.originalReading === row.resolvedReading
      && row.confidence === "reviewed"
    )).toBe(true);
  });

  it("compiles IDs, syllables, and declared provenance from reviewed rows", async () => {
    const [resolved, provenanceSource] = await Promise.all([
      loadResolvedCatalogSource(),
      readFile(new URL("../../data/provenance.csv", import.meta.url), "utf8"),
    ]);
    const provenance = createProvenanceRegistry(parseCsv(provenanceSource).records);
    expect(provenance.errors).toEqual([]);

    const compiled = compileCatalog(resolved.records, provenance.ids);
    expect(compiled.errors).toEqual([]);
    expect(compiled.entries).toHaveLength(resolved.records.length);
    expect(compiled.entries.every((entry) =>
      entry.syllables.length > 0 && entry.provenanceIds.length > 0
    )).toBe(true);
  });
});

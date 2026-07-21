import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { compileCatalog } from "../../src/catalog/compile-catalog.js";
import { parseCsv } from "../../src/catalog/csv.js";
import { createProvenanceRegistry } from "../../src/catalog/provenance.js";
import { loadResolvedCatalogSource } from "../../scripts/load-resolved-catalog-source.js";

describe("current catalog reading resolution", () => {
  it("resolves all 49 entries with the locked 41/2/4/2 authority distribution", async () => {
    const result = await loadResolvedCatalogSource();

    expect(result.report.candidateCount).toBe(49);
    expect(result.report.counts).toEqual({
      "moe-concised": 41,
      "moe-revised": 2,
      cedict: 4,
      manual: 2,
    });
    expect(result.report.changedTexts).toEqual(["我們"]);
    const rows = new Map(result.report.rows.map((row) => [row.text, row]));
    expect(rows.get("我們")?.originalReading).toBe("ㄨㄛ3 ㄇㄣ2");
    expect(rows.get("我們")?.resolvedReading).toBe("ㄨㄛ3 ㄇㄣ5");
    expect(rows.get("台灣")?.sourceKind).toBe("cedict");
    expect(rows.get("東西")?.sourceKind).toBe("manual");
    expect(rows.get("很好")?.sourceKind).toBe("manual");
  });

  it("compiles IDs, syllables, and provenance from resolved readings", async () => {
    const [resolved, provenanceSource] = await Promise.all([
      loadResolvedCatalogSource(),
      readFile(new URL("../../data/provenance.csv", import.meta.url), "utf8"),
    ]);
    const provenance = createProvenanceRegistry(parseCsv(provenanceSource).records);
    expect(provenance.errors).toEqual([]);

    const compiled = compileCatalog(resolved.records, provenance.ids);
    expect(compiled.errors).toEqual([]);
    expect(compiled.entries).toHaveLength(49);
    const entries = new Map(compiled.entries.map((entry) => [entry.prompt.text, entry]));
    expect(entries.get("我們")?.id).toBe("word:我們:ㄨㄛ3-ㄇㄣ5");
    expect(entries.get("我們")?.provenanceIds).toContain("moe:concised-dictionary");
    expect(entries.get("中文")?.provenanceIds).toContain("moe:revised-dictionary");
    expect(entries.get("台灣")?.provenanceIds).toContain("cc-cedict:manual-release");
    expect(entries.get("東西")?.provenanceIds).toContain("local:reading-review-v1");
  });
});

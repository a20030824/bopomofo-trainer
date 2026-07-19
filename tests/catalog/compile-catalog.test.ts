import { describe, expect, it } from "vitest";
import { compileCatalog } from "../../src/catalog/compile-catalog.js";
import { createCoverageReport } from "../../src/catalog/coverage.js";
import { parseCsv } from "../../src/catalog/csv.js";

const header = "text,reading,frequency_band,tags,status,provenance_ids";

describe("compileCatalog", () => {
  it("compiles semantic entries without physical key codes", () => {
    const csv = parseCsv(`${header}\n中文,ㄓㄨㄥ1 ㄨㄣ2,1,general,provisional,local:sample-v1\n`);
    const result = compileCatalog(csv.records);

    expect(result.errors).toEqual([]);
    expect(result.entries).toHaveLength(1);
    expect(JSON.stringify(result.entries)).not.toContain("KeyJ");
    expect(JSON.stringify(result.entries)).not.toContain("Space");
    expect(result.entries[0]?.provenanceIds).toEqual(["local:sample-v1"]);
  });

  it("reports field, reading, count, and duplicate errors deterministically", () => {
    const csv = parseCsv([
      header,
      "中文,ㄓㄨㄥ ㄨㄣ2,1,general,provisional,local:sample-v1",
      "三個字,ㄙㄢ1 ㄍㄜ4,1,general,provisional,local:sample-v1",
      "工程,ㄍㄨㄥ1 ㄔㄥ2,4,general,provisional,local:sample-v1",
      "媽媽,ㄇㄚ1 ㄇㄚ5,1,general,provisional,local:sample-v1",
      "媽媽,ㄇㄚ1 ㄇㄚ5,1,general,provisional,local:sample-v1",
    ].join("\n"));

    const result = compileCatalog(csv.records);
    expect(result.errors.map((error) => error.code)).toEqual([
      "reading-error",
      "syllable-count-mismatch",
      "invalid-frequency-band",
      "duplicate-entry",
    ]);
  });

  it("generates token and tone coverage", () => {
    const csv = parseCsv([
      header,
      "中文,ㄓㄨㄥ1 ㄨㄣ2,1,general,provisional,local:sample-v1",
      "媽媽,ㄇㄚ1 ㄇㄚ5,1,general,provisional,local:sample-v1",
    ].join("\n"));
    const compiled = compileCatalog(csv.records);
    const report = createCoverageReport(compiled.entries);

    expect(report.entryCount).toBe(2);
    expect(report.syllableCount).toBe(4);
    expect(report.tokenCoverage.find((item) => item.tokenId === "tone:1")?.occurrences).toBe(2);
    expect(report.tokenCoverage.find((item) => item.tokenId === "tone:5")?.occurrences).toBe(1);
  });
});

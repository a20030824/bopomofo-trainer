import { describe, expect, it } from "vitest";
import { compileCatalog } from "../../src/catalog/compile-catalog.js";
import { createCoverageReport } from "../../src/catalog/coverage.js";
import { parseCsv } from "../../src/catalog/csv.js";
import { createProvenanceRegistry } from "../../src/catalog/provenance.js";

const header = "text,reading,frequency_band,tags,status,provenance_ids";
const knownProvenanceIds = new Set(["local:sample-v1"]);

describe("compileCatalog", () => {
  it("compiles semantic entries without physical key codes", () => {
    const csv = parseCsv(`${header}\n中文,ㄓㄨㄥ1 ㄨㄣ2,1,general,provisional,local:sample-v1\n`);
    const result = compileCatalog(csv.records, knownProvenanceIds);

    expect(result.errors).toEqual([]);
    expect(result.entries).toHaveLength(1);
    expect(JSON.stringify(result.entries)).not.toContain("KeyJ");
    expect(JSON.stringify(result.entries)).not.toContain("Space");
    expect(result.entries[0]?.provenanceIds).toEqual(["local:sample-v1"]);
  });

  it("rejects provenance IDs that are not registered", () => {
    const csv = parseCsv(`${header}\n中文,ㄓㄨㄥ1 ㄨㄣ2,1,general,provisional,local:typo\n`);
    const result = compileCatalog(csv.records, knownProvenanceIds);

    expect(result.entries).toEqual([]);
    expect(result.errors.map((error) => error.code)).toEqual(["unknown-provenance"]);
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

    const result = compileCatalog(csv.records, knownProvenanceIds);
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
    const compiled = compileCatalog(csv.records, knownProvenanceIds);
    const report = createCoverageReport(compiled.entries);

    expect(report.entryCount).toBe(2);
    expect(report.syllableCount).toBe(4);
    expect(report.tokenCoverage.find((item) => item.tokenId === "tone:1")?.occurrences).toBe(2);
    expect(report.tokenCoverage.find((item) => item.tokenId === "tone:5")?.occurrences).toBe(1);
  });
});

describe("createProvenanceRegistry", () => {
  it("rejects incomplete and duplicate provenance rows", () => {
    const csv = parseCsv([
      "id,kind,title,license,notes",
      "local:sample-v1,manual,Sample,not-applicable,First",
      "local:sample-v1,manual,Duplicate,not-applicable,Second",
      "missing-title,manual,,not-applicable,Incomplete",
    ].join("\n"));

    const result = createProvenanceRegistry(csv.records);
    expect([...result.ids]).toEqual(["local:sample-v1"]);
    expect(result.errors.map((error) => error.code)).toEqual([
      "duplicate-provenance-id",
      "missing-provenance-field",
    ]);
  });
});

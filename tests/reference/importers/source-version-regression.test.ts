import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { importReferenceSource } from "../../../src/reference/importers/import-reference-source.js";
import { createTabularReferenceSourceAdapter } from "../../../src/reference/importers/tabular-adapter.js";
import type { TabularReferenceAdapterConfig } from "../../../src/reference/importers/types.js";
import type { ReferenceSourceManifest } from "../../../src/reference/types.js";

async function fixture(name: string): Promise<string> {
  return readFile(new URL(`../../../data/fixtures/reference/${name}`, import.meta.url), "utf8");
}

function manifest(version: string): ReferenceSourceManifest {
  return {
    id: "fixture:official",
    title: "Versioned source fixture",
    version,
    homepageUrl: "https://example.invalid/reference",
    downloadUrl: null,
    retrievedAt: null,
    checksumSha256: null,
    licenseLabel: "test fixture",
    redistributionStatus: "local-only",
    notes: [],
  };
}

describe("source-version regression", () => {
  it("preserves source row identity across a declared column-schema change", async () => {
    const v1Config: TabularReferenceAdapterConfig = {
      adapterId: "fixture:tabular-v1",
      adapterVersion: "1",
      sourceId: "fixture:official",
      sourceVersion: "v1",
      format: "csv",
      toneNotation: "diacritic",
      columns: {
        sourceRowId: "row_id",
        text: "text",
        reading: "reading",
        oralPerMillion: "oral",
        writtenPerMillion: "written",
        level: "level",
        levelOrdinal: "level_ordinal",
        domains: "domains",
        sourceRecordUrl: "url",
      },
      csvDelimiter: ",",
      domainSeparator: "|",
      sourceRecordUrlTemplate: "https://example.invalid/record/{sourceRowId}",
    };
    const v2Config: TabularReferenceAdapterConfig = {
      adapterId: "fixture:tabular-v2",
      adapterVersion: "2",
      sourceId: "fixture:official",
      sourceVersion: "v2",
      format: "json",
      toneNotation: "diacritic",
      columns: {
        sourceRowId: "record_id",
        text: "headword",
        reading: "bopomofo",
        oralPerMillion: "oral_per_million",
        writtenPerMillion: "written_per_million",
        level: "grade",
        levelOrdinal: "grade_order",
        domains: "topics",
        sourceRecordUrl: "record_url",
      },
      csvDelimiter: ",",
      domainSeparator: "|",
      sourceRecordUrlTemplate: null,
    };

    const v1 = importReferenceSource(
      await fixture("tabular-v1.csv"),
      createTabularReferenceSourceAdapter(v1Config),
      manifest("v1"),
    );
    const v2 = importReferenceSource(
      await fixture("tabular-v2.json"),
      createTabularReferenceSourceAdapter(v2Config),
      manifest("v2"),
    );
    const oldRow = v1.accepted.find((item) => item.row.sourceRowId === "1")!;
    const newRow = v2.accepted[0]!;

    expect(newRow.candidate.id).toBe(oldRow.candidate.id);
    expect(newRow.row).toEqual(oldRow.row);
    expect(newRow.rawReading).toBe(oldRow.rawReading);
    expect(v2.summary.sourceVersion).toBe("v2");
    expect(v2.summary.determinismDigest).not.toBe(v1.summary.determinismDigest);
  });
});

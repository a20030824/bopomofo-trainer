import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { importReferenceSource } from "../../../src/reference/importers/import-reference-source.js";
import { serializeReferenceImportResult } from "../../../src/reference/importers/serialize.js";
import { createTabularReferenceSourceAdapter } from "../../../src/reference/importers/tabular-adapter.js";
import type { TabularReferenceAdapterConfig } from "../../../src/reference/importers/types.js";
import type { ReferenceSourceManifest } from "../../../src/reference/types.js";

const manifest: ReferenceSourceManifest = {
  id: "fixture:official",
  title: "Hand-authored official-source shape fixture",
  version: "v1",
  homepageUrl: "https://example.invalid/reference",
  downloadUrl: null,
  retrievedAt: null,
  checksumSha256: null,
  licenseLabel: "test fixture",
  redistributionStatus: "local-only",
  notes: [],
};

const config: TabularReferenceAdapterConfig = {
  adapterId: "fixture:tabular",
  adapterVersion: "1",
  sourceId: manifest.id,
  sourceVersion: manifest.version,
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

async function fixture(name: string): Promise<string> {
  return readFile(new URL(`../../../data/fixtures/reference/${name}`, import.meta.url), "utf8");
}

describe("tabular reference adapter", () => {
  it("imports deterministic normalized rows and a complete error queue", async () => {
    const input = await fixture("tabular-v1.csv");
    const adapter = createTabularReferenceSourceAdapter(config);
    const first = importReferenceSource(input, adapter, manifest);
    const replay = importReferenceSource(input, adapter, manifest);

    expect(serializeReferenceImportResult(first)).toBe(serializeReferenceImportResult(replay));
    expect(first.summary).toMatchObject({
      sourceRowCount: 11,
      acceptedCount: 3,
      rejectedCount: 8,
      duplicateCount: 2,
      unresolvedPronunciationCount: 3,
      orderingReason: "source_input_order",
      fallbackReason: "no_fallback",
      stopReason: "end_of_input",
    });
    expect(first.summary.determinismDigest).toMatch(/^[0-9a-f]{64}$/u);
    expect(first.summary.rejectedByReason).toMatchObject({
      unresolved_alternatives: 1,
      multiple_pronunciations: 1,
      text_reading_syllable_mismatch: 1,
      invalid_frequency: 1,
      non_han_text: 1,
      unsupported_syllable: 1,
      duplicate_source_row_identity: 2,
    });

    expect(first.accepted.map((item) => ({
      id: item.candidate.id,
      sourceRowId: item.row.sourceRowId,
      rawReading: item.rawReading,
      normalizedReading: item.normalizedReading,
      oral: item.row.oralPerMillion,
      written: item.row.writtenPerMillion,
      url: item.row.sourceRecordUrl,
    }))).toEqual([
      {
        id: "reference:fixture:official:1",
        sourceRowId: "1",
        rawReading: "ㄎㄜˇ ㄌㄜˋ",
        normalizedReading: "ㄎㄜ3 ㄌㄜ4",
        oral: 12.5,
        written: 0,
        url: "https://example.invalid/record/1",
      },
      {
        id: "reference:fixture:official:2",
        sourceRowId: "2",
        rawReading: "ㄇㄚ ˙ㄇㄚ",
        normalizedReading: "ㄇㄚ1 ㄇㄚ5",
        oral: null,
        written: 8,
        url: "https://example.invalid/record/2",
      },
      {
        id: "reference:fixture:official:6",
        sourceRowId: "6",
        rawReading: "ㄓㄨㄥ ㄨㄣˊ",
        normalizedReading: "ㄓㄨㄥ1 ㄨㄣ2",
        oral: 1,
        written: 1,
        url: "https://example.invalid/record/6",
      },
    ]);
  });

  it("rejects every occurrence of a duplicate source identity", async () => {
    const result = importReferenceSource(
      await fixture("tabular-v1.csv"),
      createTabularReferenceSourceAdapter(config),
      manifest,
    );
    expect(result.errors.filter((item) => item.code === "duplicate_source_row_identity"))
      .toHaveLength(2);
    expect(result.accepted.some((item) => item.row.sourceRowId === "dup")).toBe(false);
  });

  it("keeps malformed JSON rows in the queue and continues", () => {
    const jsonConfig: TabularReferenceAdapterConfig = {
      ...config,
      format: "json",
      toneNotation: "explicit-digits",
      columns: {
        sourceRowId: "id",
        text: "text",
        reading: "reading",
        oralPerMillion: null,
        writtenPerMillion: null,
        level: null,
        levelOrdinal: null,
        domains: null,
        sourceRecordUrl: null,
      },
    };
    const result = importReferenceSource(
      JSON.stringify(["not-an-object", { id: "ok", text: "媽", reading: "ㄇㄚ1" }]),
      createTabularReferenceSourceAdapter(jsonConfig),
      manifest,
    );
    expect(result.summary).toMatchObject({ sourceRowCount: 2, acceptedCount: 1, rejectedCount: 1 });
    expect(result.errors[0]).toMatchObject({
      code: "malformed_tabular_row",
      inputIndex: 0,
      adapterRow: null,
    });
  });

  it("distinguishes missing frequency from a true zero and queues explicit-tone failures", async () => {
    const explicitConfig: TabularReferenceAdapterConfig = {
      ...config,
      format: "json",
      toneNotation: "explicit-digits",
      columns: {
        sourceRowId: "id",
        text: "text",
        reading: "reading",
        oralPerMillion: "oral",
        writtenPerMillion: "written",
        level: null,
        levelOrdinal: null,
        domains: null,
        sourceRecordUrl: null,
      },
    };
    const result = importReferenceSource(
      await fixture("tabular-explicit-errors.json"),
      createTabularReferenceSourceAdapter(explicitConfig),
      manifest,
    );
    expect(result.errors.map((item) => item.code)).toEqual([
      "missing_tone",
      "multiple_pronunciations",
    ]);
    expect(result.errors[1]?.adapterRow?.rawReading).toEqual(["ㄒㄧㄥˊ", "ㄏㄤˊ"]);
    expect(result.accepted[0]?.row).toMatchObject({
      sourceRowId: "accepted",
      oralPerMillion: 0,
      writtenPerMillion: null,
    });
  });
});

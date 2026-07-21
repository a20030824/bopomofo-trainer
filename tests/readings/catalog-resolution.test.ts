import { describe, expect, it } from "vitest";
import { parseCsv } from "../../src/catalog/csv.js";
import {
  CatalogReadingResolutionError,
  resolveCatalogReadings,
  synchronizeRecordReadings,
} from "../../src/readings/catalog-resolution.js";

const catalogHeader = "text,reading,frequency_band,tags,status,provenance_ids";

function fixtures() {
  const catalogRecords = parseCsv([
    catalogHeader,
    "甲,ㄍㄚ3,1,general,provisional,local:sample-v1",
    "乙,ㄧ3,1,general,provisional,local:sample-v1",
    "丙,ㄅㄧㄥ3,1,general,provisional,local:sample-v1",
    "丁,ㄉㄧㄥ1,1,general,provisional,local:sample-v1",
  ].join("\n")).records;
  const moeConcisedProjection = {
    adapterVersion: "moe-concised-reading-adapter-v1",
    source: { sourceId: "moe:concised-dictionary", sourceVersion: "fixture-concised" },
    candidateSet: { entryCount: 4 },
    rows: [{ lookupText: "甲", trainerReading: "ㄐㄧㄚ3", sourceEntryId: "c1" }],
  };
  const moeRevisedProjection = {
    adapterVersion: "moe-revised-reading-fallback-adapter-v1",
    source: { sourceId: "moe:revised-dictionary", sourceVersion: "fixture-revised" },
    fallbackBasis: { fallbackCandidateTexts: ["乙", "丙", "丁"] },
    rows: [{
      lookupText: "乙",
      trainerReading: "ㄧ3",
      sourceEntryId: "r1",
      fallbackStatus: "provisional",
    }],
  };
  const cedictProjection = {
    adapterVersion: "cedict-identity-hints-adapter-v1",
    source: { sourceId: "cc-cedict:manual-release", sourceVersion: "fixture-cedict" },
    resolutionBasis: { cedictTargetTexts: ["丙", "丁"] },
    rows: [
      {
        lookupText: "丙",
        status: "unique-record",
        records: [{ pinyin: "bing3", sourceLine: 10 }],
      },
      {
        lookupText: "丁",
        status: "ambiguous-records",
        records: [
          { pinyin: "ding1", sourceLine: 11 },
          { pinyin: "zheng1", sourceLine: 12 },
        ],
      },
    ],
  };
  const manualOverrides = {
    version: "manual-reading-overrides-v1",
    sourceVersion: "fixture-review",
    provenanceId: "local:reading-review-v1",
    rows: [{ text: "丁", reading: "ㄉㄧㄥ1", reason: "fixture reviewed choice" }],
  };
  return {
    catalogRecords,
    moeConcisedProjection,
    moeRevisedProjection,
    cedictProjection,
    manualOverrides,
  };
}

describe("resolveCatalogReadings", () => {
  it("applies the authority order and merges reading provenance", () => {
    const result = resolveCatalogReadings(fixtures());

    expect(result.report.counts).toEqual({
      "moe-concised": 1,
      "moe-revised": 1,
      cedict: 1,
      manual: 1,
    });
    expect(result.report.changedTexts).toEqual(["甲"]);
    expect(result.records.map((record) => record.values.reading)).toEqual([
      "ㄐㄧㄚ3",
      "ㄧ3",
      "ㄅㄧㄥ3",
      "ㄉㄧㄥ1",
    ]);
    expect(result.records[0]?.values.provenance_ids).toBe(
      "local:sample-v1;moe:concised-dictionary",
    );
    expect(result.records[2]?.values.provenance_ids).toBe(
      "local:sample-v1;cc-cedict:manual-release",
    );
    expect(result.report.determinismDigest).toMatch(/^[0-9a-f]{64}$/u);
  });

  it("synchronizes sidecar identity readings without changing sidecar provenance", () => {
    const result = resolveCatalogReadings(fixtures());
    const grammar = parseCsv([
      "text,reading,roles,predicate_frame,standalone_kind,provenance_ids",
      "甲,ㄍㄚ3,subject,none,lexical,local:grammar-review-v1",
    ].join("\n")).records;

    const synchronized = synchronizeRecordReadings(grammar, result.report);
    expect(synchronized[0]?.values.reading).toBe("ㄐㄧㄚ3");
    expect(synchronized[0]?.values.provenance_ids).toBe("local:grammar-review-v1");
  });

  it("rejects lower-authority overlap", () => {
    const input = fixtures();
    input.moeRevisedProjection.rows.push({
      lookupText: "甲",
      trainerReading: "ㄐㄧㄚ3",
      sourceEntryId: "r2",
      fallbackStatus: "provisional",
    });
    input.moeRevisedProjection.fallbackBasis.fallbackCandidateTexts.push("甲");

    expect(() => resolveCatalogReadings(input)).toThrowError(CatalogReadingResolutionError);
  });

  it("rejects stale, missing, or extra manual overrides", () => {
    const input = fixtures();
    input.manualOverrides.rows = [];
    expect(() => resolveCatalogReadings(input)).toThrow(/must exactly match/u);
  });

  it("rejects a CEDICT target set that no longer matches MOE gaps", () => {
    const input = fixtures();
    input.cedictProjection.resolutionBasis.cedictTargetTexts = ["丙"];
    expect(() => resolveCatalogReadings(input)).toThrow(/target set/u);
  });
});

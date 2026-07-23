import { describe, expect, it } from "vitest";
import { parseCsv } from "../../src/catalog/csv.js";
import { resolveCatalogReadings } from "../../src/readings/catalog-resolution.js";

function projection(entryCount: number, normalizedTextCount: number) {
  return {
    adapterVersion: "moe-concised-reading-adapter-v1",
    source: { sourceId: "moe:test", sourceVersion: "1" },
    candidateSet: { entryCount, normalizedTextCount },
    rows: [],
  };
}

const revised = {
  adapterVersion: "moe-revised-reading-fallback-adapter-v1",
  source: { sourceId: "moe:test-revised", sourceVersion: "1" },
  fallbackBasis: { fallbackCandidateTexts: ["行"] },
  rows: [],
};

const cedict = {
  adapterVersion: "cedict-identity-hints-adapter-v1",
  source: { sourceId: "cedict:test", sourceVersion: "1" },
  resolutionBasis: { cedictTargetTexts: ["行"] },
  rows: [{
    lookupText: "行",
    status: "ambiguous-records",
    records: [
      { pinyin: "xing2", sourceLine: 1 },
      { pinyin: "hang2", sourceLine: 2 },
    ],
  }],
};

const manual = {
  version: "manual-reading-overrides-v1",
  sourceVersion: "1",
  provenanceId: "test:manual",
  rows: [
    { text: "行", reading: "ㄒㄧㄥ2", reason: "fixture" },
    { text: "行", reading: "ㄏㄤ2", reason: "fixture" },
  ],
};

describe("reading projection identity counts", () => {
  it("accepts exact-entry counts when heteronyms share one written form", () => {
    const catalogRecords = parseCsv([
      "text,reading,frequency_band,tags,status,provenance_ids",
      "行,ㄒㄧㄥ2,1,test,reviewed,test",
      "行,ㄏㄤ2,1,test,reviewed,test",
    ].join("\n")).records;
    const result = resolveCatalogReadings({
      catalogRecords,
      moeConcisedProjection: projection(2, 1),
      moeRevisedProjection: revised,
      cedictProjection: cedict,
      manualOverrides: manual,
    });

    expect(result.records).toHaveLength(2);
  });

  it("rejects a mismatched normalized written-form count", () => {
    const catalogRecords = parseCsv([
      "text,reading,frequency_band,tags,status,provenance_ids",
      "行,ㄒㄧㄥ2,1,test,reviewed,test",
    ].join("\n")).records;
    expect(() => resolveCatalogReadings({
      catalogRecords,
      moeConcisedProjection: projection(1, 2),
      moeRevisedProjection: revised,
      cedictProjection: cedict,
      manualOverrides: manual,
    })).toThrow(/text count mismatch/u);
  });
});

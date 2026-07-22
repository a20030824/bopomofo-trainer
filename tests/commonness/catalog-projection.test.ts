import { describe, expect, it } from "vitest";
import {
  applyCommonnessProjection,
  catalogEntryFrequencyWeight,
} from "../../src/commonness/catalog-projection.js";
import { projectCommonness } from "../../src/commonness/project.js";
import type { CatalogEntry, FrequencyBand } from "../../src/core/model.js";

function entry(id: string, frequencyBand: FrequencyBand): CatalogEntry {
  return {
    id,
    prompt: { text: id, locale: "zh-TW" },
    syllables: [],
    frequencyBand,
    tags: ["fixture"],
    provenanceIds: ["fixture"],
  };
}

describe("catalog commonness projection", () => {
  it("applies reviewed evidence and keeps frequency bands as fallback", () => {
    const projection = projectCommonness([
      {
        catalogEntryId: "high",
        catalogText: "high",
        sourceId: "naer:general-frequency",
        sourceVersion: "fixture-v1",
        sourceRowId: "1",
        spokenPerMillion: 100,
        writtenPerMillion: 100,
        identityStatus: "reviewed",
      },
      {
        catalogEntryId: "unused",
        catalogText: "unused",
        sourceId: "naer:general-frequency",
        sourceVersion: "fixture-v1",
        sourceRowId: "2",
        spokenPerMillion: 10,
        writtenPerMillion: 10,
        identityStatus: "reviewed",
      },
    ]);
    const applied = applyCommonnessProjection([
      entry("high", 3),
      entry("fallback", 1),
    ], projection);
    expect(applied.appliedEntryIds).toEqual(["high"]);
    expect(applied.unusedProjectionEntryIds).toEqual(["unused"]);
    expect(catalogEntryFrequencyWeight(applied.entries[0]!, { 1: 1, 2: 0.5, 3: 0.25 }))
      .toBe(1);
    expect(catalogEntryFrequencyWeight(applied.entries[1]!, { 1: 1, 2: 0.5, 3: 0.25 }))
      .toBe(1);
  });
});

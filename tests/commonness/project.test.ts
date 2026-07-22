import { describe, expect, it } from "vitest";
import {
  projectCommonness,
  serializeCommonnessProjection,
} from "../../src/commonness/project.js";
import type { CommonnessEvidence } from "../../src/commonness/types.js";

const evidence: readonly CommonnessEvidence[] = [
  {
    catalogEntryId: "word:common",
    catalogText: "common",
    sourceId: "naer:general-frequency",
    sourceVersion: "fixture-v1",
    sourceRowId: "1",
    spokenPerMillion: 100,
    writtenPerMillion: 25,
    identityStatus: "reviewed",
  },
  {
    catalogEntryId: "word:zero",
    catalogText: "zero",
    sourceId: "naer:general-frequency",
    sourceVersion: "fixture-v1",
    sourceRowId: "2",
    spokenPerMillion: 0,
    writtenPerMillion: null,
    identityStatus: "reviewed",
  },
  {
    catalogEntryId: "word:missing",
    catalogText: "missing",
    sourceId: "naer:general-frequency",
    sourceVersion: "fixture-v1",
    sourceRowId: "3",
    spokenPerMillion: null,
    writtenPerMillion: null,
    identityStatus: "reviewed",
  },
];

describe("commonness projection", () => {
  it("is deterministic and preserves observed zero separately from missing", () => {
    const first = projectCommonness(evidence);
    const replay = projectCommonness([...evidence].reverse());
    expect(serializeCommonnessProjection(replay)).toBe(serializeCommonnessProjection(first));
    expect(first.determinismDigest).toMatch(/^[0-9a-f]{64}$/u);
    expect(first.entries.find((item) => item.catalogEntryId === "word:zero")?.base)
      .toMatchObject({
        spokenPerMillion: 0,
        writtenPerMillion: null,
        spokenStrength: 0,
        writtenStrength: null,
        score: 0,
        selectionWeight: 0.05,
      });
    expect(first.exclusions).toContainEqual(expect.objectContaining({
      catalogEntryId: "word:missing",
      code: "missing_frequency",
    }));
  });

  it("excludes identities that share one source row but are different texts", () => {
    const projection = projectCommonness([
      {
        catalogEntryId: "word:a",
        catalogText: "甲",
        sourceId: "naer:general-frequency",
        sourceVersion: "fixture-v1",
        sourceRowId: "same",
        spokenPerMillion: 1,
        writtenPerMillion: 1,
        identityStatus: "reviewed",
      },
      {
        catalogEntryId: "word:b",
        catalogText: "乙",
        sourceId: "naer:general-frequency",
        sourceVersion: "fixture-v1",
        sourceRowId: "same",
        spokenPerMillion: 1,
        writtenPerMillion: 1,
        identityStatus: "reviewed",
      },
    ]);
    expect(projection.entries).toEqual([]);
    expect(projection.exclusions).toHaveLength(2);
    expect(projection.exclusions.every((item) => item.code === "shared_source_row_identity"))
      .toBe(true);
  });

  it("applies one source row to every reading variant of the same heteronym text", () => {
    const projection = projectCommonness([
      {
        catalogEntryId: "word:了:ㄌㄜ5",
        catalogText: "了",
        sourceId: "naer:general-frequency",
        sourceVersion: "fixture-v1",
        sourceRowId: "same",
        spokenPerMillion: 1,
        writtenPerMillion: 1,
        identityStatus: "reviewed",
      },
      {
        catalogEntryId: "word:了:ㄌㄧㄠ3",
        catalogText: "了",
        sourceId: "naer:general-frequency",
        sourceVersion: "fixture-v1",
        sourceRowId: "same",
        spokenPerMillion: 1,
        writtenPerMillion: 1,
        identityStatus: "reviewed",
      },
    ]);
    expect(projection.exclusions).toEqual([]);
    expect(projection.entries.map((item) => item.catalogEntryId)).toEqual([
      "word:了:ㄌㄜ5",
      "word:了:ㄌㄧㄠ3",
    ]);
  });

  it("rejects unresolved identities and invalid frequencies", () => {
    const projection = projectCommonness([
      {
        catalogEntryId: "word:unreviewed",
        catalogText: "unreviewed",
        sourceId: "naer:general-frequency",
        sourceVersion: "fixture-v1",
        sourceRowId: "u",
        spokenPerMillion: 2,
        writtenPerMillion: 2,
        identityStatus: "unresolved",
      },
      {
        catalogEntryId: "word:negative",
        catalogText: "negative",
        sourceId: "naer:general-frequency",
        sourceVersion: "fixture-v1",
        sourceRowId: "n",
        spokenPerMillion: -1,
        writtenPerMillion: 2,
        identityStatus: "reviewed",
      },
    ]);
    expect(projection.exclusions.map((item) => item.code).sort()).toEqual([
      "invalid_frequency",
      "unresolved_identity",
    ]);
  });
});

import { describe, expect, it } from "vitest";
import type { CatalogEntry } from "../../src/core/model.js";
import {
  NAER_GENERAL_FREQUENCY_ADAPTER_VERSION,
  NAER_GENERAL_FREQUENCY_DIMENSION,
  NAER_GENERAL_FREQUENCY_HEADERS,
  NAER_GENERAL_FREQUENCY_SHA256,
  NAER_GENERAL_FREQUENCY_SHEET,
  NAER_GENERAL_FREQUENCY_SOURCE_ID,
  NAER_GENERAL_FREQUENCY_SOURCE_VERSION,
  mapNaerRowsToCatalogEvidence,
  projectNaerActiveCatalogRows,
  projectNaerCommonness,
  validateNaerWorkbookIdentity,
  type NaerActiveCatalogRowsFile,
} from "../../src/commonness/naer-general-frequency.js";

function entry(id: string, text: string): CatalogEntry {
  return {
    id,
    prompt: { text, locale: "zh-TW" },
    syllables: [],
    frequencyBand: 1,
    tags: [],
    provenanceIds: [],
  };
}

const identity = {
  sourceId: NAER_GENERAL_FREQUENCY_SOURCE_ID,
  sourceVersion: NAER_GENERAL_FREQUENCY_SOURCE_VERSION,
  checksumSha256: NAER_GENERAL_FREQUENCY_SHA256,
  sheetName: NAER_GENERAL_FREQUENCY_SHEET,
  dimension: NAER_GENERAL_FREQUENCY_DIMENSION,
  headers: NAER_GENERAL_FREQUENCY_HEADERS,
};

function activeRows(
  rows: NaerActiveCatalogRowsFile["rows"],
): NaerActiveCatalogRowsFile {
  return {
    adapterVersion: NAER_GENERAL_FREQUENCY_ADAPTER_VERSION,
    source: identity,
    rows,
  };
}

describe("NAER general-frequency adapter", () => {
  it("pins source, checksum, sheet, dimension, version, and exact headers", () => {
    expect(() => validateNaerWorkbookIdentity(identity)).not.toThrow();
    expect(() => validateNaerWorkbookIdentity({
      ...identity,
      checksumSha256: "bad",
    })).toThrow(/checksum/);
    expect(() => validateNaerWorkbookIdentity({
      ...identity,
      sheetName: "bad",
    })).toThrow(/sheet/);
    expect(() => validateNaerWorkbookIdentity({
      ...identity,
      dimension: "A1:G2",
    })).toThrow(/dimension/);
    expect(() => validateNaerWorkbookIdentity({
      ...identity,
      headers: [...identity.headers].reverse(),
    })).toThrow(/headers/);
  });

  it("preserves numeric zero and null as distinct values", () => {
    const result = mapNaerRowsToCatalogEvidence([
      {
        generalRank: 1,
        lexicalText: " 零 ",
        writtenPerMillion: 0,
        spokenPerMillion: null,
      },
    ], [entry("zero", "零")]);
    expect(result.evidence[0]).toMatchObject({
      sourceRowId: "1141208:1",
      writtenPerMillion: 0,
      spokenPerMillion: null,
    });
  });

  it("maps NFC-trimmed exact text to every matching entry, including heteronym siblings", () => {
    const result = mapNaerRowsToCatalogEvidence([
      {
        generalRank: 2,
        lexicalText: " 測試 ",
        writtenPerMillion: 2,
        spokenPerMillion: 3,
      },
      {
        generalRank: 3,
        lexicalText: "歧義",
        writtenPerMillion: 4,
        spokenPerMillion: 5,
      },
      {
        generalRank: 4,
        lexicalText: "來源孤兒",
        writtenPerMillion: 6,
        spokenPerMillion: 7,
      },
    ], [
      entry("test", "測試"),
      entry("a", "歧義"),
      entry("b", "歧義"),
      entry("catalog-only", "詞庫孤兒"),
    ]);

    expect(result.evidence.map((item) => item.catalogEntryId)).toEqual(["a", "b", "test"]);
    expect(result.exclusions).toEqual([
      {
        sourceRowId: "1141208:4",
        lexicalText: "來源孤兒",
        code: "unmatched_text",
        catalogEntryIds: [],
      },
    ]);
    expect(result.unmatchedCatalogEntryIds).toEqual(["catalog-only"]);
  });

  it("rejects duplicate source rank or normalized lexical text", () => {
    expect(() => mapNaerRowsToCatalogEvidence([
      {
        generalRank: 1,
        lexicalText: "甲",
        writtenPerMillion: 1,
        spokenPerMillion: 1,
      },
      {
        generalRank: 1,
        lexicalText: "乙",
        writtenPerMillion: 1,
        spokenPerMillion: 1,
      },
    ], [entry("a", "甲"), entry("b", "乙")])).toThrow(/rank/);

    expect(() => mapNaerRowsToCatalogEvidence([
      {
        generalRank: 1,
        lexicalText: " 甲 ",
        writtenPerMillion: 1,
        spokenPerMillion: 1,
      },
      {
        generalRank: 2,
        lexicalText: "甲",
        writtenPerMillion: 1,
        spokenPerMillion: 1,
      },
    ], [entry("a", "甲")])).toThrow(/lexical text/);
  });

  it("projects deterministically regardless of row and catalog order", () => {
    const rows = [
      {
        generalRank: 2,
        lexicalText: "乙",
        writtenPerMillion: 0,
        spokenPerMillion: 2,
      },
      {
        generalRank: 1,
        lexicalText: "甲",
        writtenPerMillion: 5,
        spokenPerMillion: 0,
      },
    ] as const;
    const catalog = [entry("a", "甲"), entry("b", "乙")];
    const forward = projectNaerCommonness(identity, rows, catalog);
    const reversed = projectNaerCommonness(
      identity,
      [...rows].reverse(),
      [...catalog].reverse(),
    );
    expect(reversed).toEqual(forward);
  });

  it("validates the adapter version before projecting active rows", () => {
    const source = activeRows([
      {
        generalRank: 1,
        lexicalText: "甲",
        writtenPerMillion: 1,
        spokenPerMillion: 1,
      },
    ]);
    expect(projectNaerActiveCatalogRows(source, [entry("a", "甲")]).evidence)
      .toHaveLength(1);
    expect(() => projectNaerActiveCatalogRows({
      ...source,
      adapterVersion: "future",
    }, [entry("a", "甲")])).toThrow(/adapter version/);
  });

  it("rejects negative and non-finite frequencies", () => {
    expect(() => mapNaerRowsToCatalogEvidence([
      {
        generalRank: 1,
        lexicalText: "甲",
        writtenPerMillion: -1,
        spokenPerMillion: 0,
      },
    ], [entry("a", "甲")])).toThrow(/writtenPerMillion/);
    expect(() => mapNaerRowsToCatalogEvidence([
      {
        generalRank: 1,
        lexicalText: "甲",
        writtenPerMillion: 0,
        spokenPerMillion: Number.NaN,
      },
    ], [entry("a", "甲")])).toThrow(/spokenPerMillion/);
  });
});

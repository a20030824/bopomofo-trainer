import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { importReferenceSource } from "../../../src/reference/importers/import-reference-source.js";
import { serializeReferenceImportResult } from "../../../src/reference/importers/serialize.js";
import { createTabularReferenceSourceAdapter } from "../../../src/reference/importers/tabular-adapter.js";
import type { TabularReferenceAdapterConfig } from "../../../src/reference/importers/types.js";
import type { ReferenceSourceManifest } from "../../../src/reference/types.js";

const manifest: ReferenceSourceManifest = {
  id: "fixture:official",
  title: "Hand-authored malformed duplicate fixture",
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
  csvDelimiter: ",",
  domainSeparator: "|",
  sourceRecordUrlTemplate: null,
};

async function fixture(): Promise<string> {
  return readFile(
    new URL(
      "../../../data/fixtures/reference/tabular-malformed-duplicate.json",
      import.meta.url,
    ),
    "utf8",
  );
}

describe("malformed duplicate source identities", () => {
  it("rejects malformed and valid occurrences sharing recoverable identities", async () => {
    const input = await fixture();
    const adapter = createTabularReferenceSourceAdapter(config);
    const first = importReferenceSource(input, adapter, manifest);
    const replay = importReferenceSource(input, adapter, manifest);

    expect(serializeReferenceImportResult(first)).toBe(
      serializeReferenceImportResult(replay),
    );
    expect(first.summary).toMatchObject({
      sourceRowCount: 4,
      acceptedCount: 0,
      rejectedCount: 4,
      duplicateCount: 4,
    });
    expect(first.summary.rejectedByReason).toMatchObject({
      missing_required_column: 1,
      malformed_tabular_row: 1,
      duplicate_source_row_identity: 4,
    });
    expect(first.errors.map((error) => ({
      sourceRowId: error.sourceRowId,
      code: error.code,
      relatedCodes: error.relatedCodes,
      reasonCodes: error.reasons.map((reason) => reason.code),
    }))).toEqual([
      {
        sourceRowId: "missing-reading",
        code: "missing_required_column",
        relatedCodes: ["duplicate_source_row_identity"],
        reasonCodes: [
          "missing_required_column",
          "duplicate_identity_all_occurrences_rejected",
        ],
      },
      {
        sourceRowId: "missing-reading",
        code: "duplicate_source_row_identity",
        relatedCodes: [],
        reasonCodes: ["duplicate_identity_all_occurrences_rejected"],
      },
      {
        sourceRowId: "nested-value",
        code: "malformed_tabular_row",
        relatedCodes: ["duplicate_source_row_identity"],
        reasonCodes: [
          "malformed_tabular_row",
          "duplicate_identity_all_occurrences_rejected",
        ],
      },
      {
        sourceRowId: "nested-value",
        code: "duplicate_source_row_identity",
        relatedCodes: [],
        reasonCodes: ["duplicate_identity_all_occurrences_rejected"],
      },
    ]);
  });
});

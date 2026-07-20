import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { importReferenceSource } from "../../../src/reference/importers/import-reference-source.js";
import { serializeReferenceImportResult } from "../../../src/reference/importers/serialize.js";
import { createTabularReferenceSourceAdapter } from "../../../src/reference/importers/tabular-adapter.js";
import type { TabularReferenceAdapterConfig } from "../../../src/reference/importers/types.js";
import type { ReferenceSourceManifest } from "../../../src/reference/types.js";

const manifest: ReferenceSourceManifest = {
  id: "fixture:official",
  title: "Hand-authored unterminated CSV quote fixture",
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
      "../../../data/fixtures/reference/tabular-unclosed-quote.csv",
      import.meta.url,
    ),
    "utf8",
  );
}

describe("unterminated CSV quoted tail", () => {
  it("keeps completed rows and queues the malformed tail without throwing", async () => {
    const input = await fixture();
    const adapter = createTabularReferenceSourceAdapter(config);
    const first = importReferenceSource(input, adapter, manifest);
    const replay = importReferenceSource(input, adapter, manifest);

    expect(serializeReferenceImportResult(first)).toBe(
      serializeReferenceImportResult(replay),
    );
    expect(first.summary).toMatchObject({
      sourceRowCount: 2,
      acceptedCount: 1,
      rejectedCount: 1,
      duplicateCount: 0,
      unresolvedPronunciationCount: 0,
    });
    expect(first.summary.rejectedByReason).toMatchObject({
      malformed_tabular_row: 1,
    });
    expect(first.accepted[0]?.row).toMatchObject({
      sourceRowId: "A",
      text: "甲",
      reading: "ㄐㄧㄚ3",
    });
    expect(first.errors[0]).toMatchObject({
      inputIndex: 1,
      sourceRowId: "B",
      code: "malformed_tabular_row",
      relatedCodes: [],
      stage: "tabular-parse",
      adapterRow: null,
      reasons: [
        {
          code: "malformed_tabular_row",
          details: {
            parseFailure: "unterminated_quoted_field",
            quotedFieldIndex: 2,
            expectedFieldCount: 3,
            actualFieldCount: 3,
          },
        },
      ],
    });
  });
});

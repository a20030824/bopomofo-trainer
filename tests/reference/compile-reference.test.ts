import { describe, expect, it } from "vitest";
import { compileReferenceRow } from "../../src/reference/compile-reference.js";
import { createReferenceSourceRegistry } from "../../src/reference/source-registry.js";
import type {
  ReferenceSourceManifest,
  ReferenceSourceRow,
} from "../../src/reference/types.js";

const manifest: ReferenceSourceManifest = {
  id: "fixture:naer",
  title: "Fixture Taiwan Mandarin words",
  version: "test-v1",
  homepageUrl: "https://example.invalid/fixture",
  downloadUrl: null,
  retrievedAt: null,
  checksumSha256: null,
  licenseLabel: "test fixture",
  redistributionStatus: "local-only",
  notes: [],
};
const sources = createReferenceSourceRegistry([manifest]);

function row(overrides: Partial<ReferenceSourceRow> = {}): ReferenceSourceRow {
  return {
    sourceId: manifest.id,
    sourceRowId: "1",
    text: "可樂",
    reading: "ㄎㄜ3 ㄌㄜ4",
    oralPerMillion: 100,
    writtenPerMillion: 80,
    level: "1",
    levelOrdinal: 1,
    domains: ["餐飲", "核心詞", "餐飲"],
    sourceRecordUrl: null,
    ...overrides,
  };
}

describe("reference compilation", () => {
  it("compiles one resolved Han headword and deterministic metadata", () => {
    const result = compileReferenceRow(row(), sources);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.candidate).toMatchObject({
      id: "reference:fixture:naer:1",
      text: "可樂",
      reading: "ㄎㄜ3 ㄌㄜ4",
      syllableCount: 2,
      tokenCount: 6,
      domains: ["核心詞", "餐飲"],
    });
  });

  it.each([
    ["unresolved-alternative", row({ text: "爸爸/爸" })],
    ["unresolved-alternative", row({ reading: "ㄅㄚ4 ㄅㄚ5 / ㄅㄚ4" })],
    ["invalid-text", row({ text: "A可樂" })],
    ["syllable-count-mismatch", row({ text: "可樂多" })],
    ["invalid-frequency", row({ oralPerMillion: -1 })],
    ["invalid-level", row({ levelOrdinal: 1.5 })],
    ["unknown-source", row({ sourceId: "missing" })],
  ] as const)("rejects %s rows", (code, sourceRow) => {
    const result = compileReferenceRow(sourceRow, sources);
    expect(result).toMatchObject({ ok: false, error: { code } });
  });
});

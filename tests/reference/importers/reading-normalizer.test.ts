import { describe, expect, it } from "vitest";
import { normalizeReferenceReading } from "../../../src/reference/importers/reading-normalizer.js";

describe("reference reading normalization", () => {
  it("normalizes Taiwan diacritic tones without losing the raw reading", () => {
    const result = normalizeReferenceReading("ㄇㄚ ˙ㄇㄚ ㄎㄜˇ ㄌㄜˋ", "diacritic");
    expect(result).toMatchObject({
      ok: true,
      rawReading: "ㄇㄚ ˙ㄇㄚ ㄎㄜˇ ㄌㄜˋ",
      normalizedReading: "ㄇㄚ1 ㄇㄚ5 ㄎㄜ3 ㄌㄜ4",
    });
  });

  it("preserves explicit digit tones", () => {
    expect(normalizeReferenceReading("ㄓㄨㄥ1 ㄨㄣ2", "explicit-digits")).toMatchObject({
      ok: true,
      normalizedReading: "ㄓㄨㄥ1 ㄨㄣ2",
    });
  });

  it("does not guess an unmarked syllable outside a declared diacritic source", () => {
    expect(normalizeReferenceReading("ㄇㄚ", "mixed")).toMatchObject({
      ok: false,
      code: "missing_tone",
    });
  });

  it.each([
    ["unresolved_alternatives", "ㄧㄣˊ ㄏㄤˊ/ㄧㄣˊ ㄒㄧㄥˊ"],
    ["multiple_pronunciations", "ㄒㄧㄥˊ；ㄏㄤˊ"],
    ["unsupported_syllable", "ㄅㄅ"],
  ] as const)("queues %s instead of choosing a pronunciation", (code: string, reading: string) => {
    expect(normalizeReferenceReading(reading, "diacritic")).toMatchObject({ ok: false, code });
  });

  it("preserves a single-value pronunciation array as raw source evidence", () => {
    expect(normalizeReferenceReading(["  ㄇㄚ1  "], "explicit-digits")).toMatchObject({
      ok: true,
      rawReading: ["  ㄇㄚ1  "],
      normalizedReading: "ㄇㄚ1",
    });
  });

  it("queues an empty pronunciation array instead of inventing a reading", () => {
    expect(normalizeReferenceReading([], "explicit-digits")).toMatchObject({
      ok: false,
      code: "missing_tone",
    });
  });

  it.each([
    ["ㄇㄚˉ", "explicit-digits"],
    ["ㄇㄚ1", "diacritic"],
  ] as const)("rejects tone notation mismatches for %s", (
    reading: string,
    notation: "diacritic" | "explicit-digits",
  ) => {
    expect(normalizeReferenceReading(reading, notation)).toMatchObject({
      ok: false,
      code: "unsupported_syllable",
      reasons: [{ code: "tone_notation_mismatch" }],
    });
  });

  it("queues a pronunciation array with more than one value", () => {
    expect(normalizeReferenceReading(["ㄒㄧㄥˊ", "ㄏㄤˊ"], "diacritic")).toMatchObject({
      ok: false,
      code: "multiple_pronunciations",
    });
  });
});

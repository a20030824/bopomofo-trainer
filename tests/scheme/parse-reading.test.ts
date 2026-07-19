import { describe, expect, it } from "vitest";
import { parseReading } from "../../src/scheme/parse-reading.js";

function expectValid(reading: string): void {
  const result = parseReading(reading);
  expect(result.ok, reading).toBe(true);
}

describe("parseReading", () => {
  it("parses explicit tones and preserves syllable boundaries", () => {
    const result = parseReading("ㄓㄨㄥ1 ㄨㄣ2");
    expect(result).toEqual({
      ok: true,
      syllables: [
        { tokens: ["zhuyin:ㄓ", "zhuyin:ㄨ", "zhuyin:ㄥ", "tone:1"] },
        { tokens: ["zhuyin:ㄨ", "zhuyin:ㄣ", "tone:2"] },
      ],
    });
  });

  it("accepts attested zero initials, apical vowels, er, ü families, and light tone", () => {
    [
      "ㄨㄛ3", "ㄓ1", "ㄦ2", "ㄐㄩㄝ2", "ㄋㄩ3", "ㄇㄚ5",
      "ㄧㄛ1", "ㄧㄞ2", "ㄙㄟ1",
    ].forEach(expectValid);
  });

  it("accepts rare standalone syllables verified during the inventory audit", () => {
    ["ㄉㄣ4", "ㄋㄨㄣ2", "ㄌㄛ5", "ㄌㄩㄢ2"].forEach(expectValid);
  });

  it("rejects missing and invalid tones", () => {
    const missing = parseReading("ㄓㄨㄥ");
    expect(missing.ok).toBe(false);
    if (!missing.ok) {
      expect(missing.errors[0]?.code).toBe("missing-tone");
    }

    const invalid = parseReading("ㄓㄨㄥ9");
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) {
      expect(invalid.errors[0]?.code).toBe("invalid-tone");
    }
  });

  it("rejects unknown symbols and unsupported Mandarin combinations", () => {
    for (const reading of ["bo1", "ㄅㄩㄥ1", "ㄐㄨㄥ1", "ㄓㄧ1", "ㄦㄢ2", "ㄕㄨㄥ1"]) {
      const result = parseReading(reading);
      expect(result.ok, reading).toBe(false);
    }
  });

  it("does not treat an attached-erhua-only body as a standalone catalog syllable", () => {
    const result = parseReading("ㄋㄧㄚ2");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]?.code).toBe("unsupported-syllable");
    }
  });
});

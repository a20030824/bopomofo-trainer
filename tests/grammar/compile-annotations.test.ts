import { describe, expect, it } from "vitest";
import { parseCsv } from "../../src/catalog/csv.js";
import type { CatalogEntry } from "../../src/core/model.js";
import { compileGrammarAnnotations } from "../../src/grammar/compile-annotations.js";

function entry(text: string, reading: string): CatalogEntry {
  return {
    id: `word:${text}:${reading.replace(/\s+/gu, "-")}`,
    prompt: { text, locale: "zh-TW" },
    syllables: [{ tokens: ["zhuyin:ㄅ", "tone:1"] }],
    frequencyBand: 1,
    tags: ["test"],
    provenanceIds: ["test:grammar"],
  };
}

const provenance = new Set(["test:grammar"]);

describe("grammar annotation compiler", () => {
  it("compiles complete reviewed sidecar annotations", () => {
    const entries = [
      entry("老師", "ㄌㄠ3 ㄕ1"),
      entry("使用", "ㄕ3 ㄩㄥ4"),
    ];
    const source = `text,reading,roles,predicate_frame,standalone_kind,provenance_ids
老師,ㄌㄠ3 ㄕ1,subject,none,lexical-prompt,test:grammar
使用,ㄕ3 ㄩㄥ4,transitive-predicate;verb,transitive,lexical-prompt,test:grammar
`;
    const result = compileGrammarAnnotations(parseCsv(source).records, entries, provenance);
    expect(result.errors).toEqual([]);
    expect(result.annotations[entries[0]!.id]).toMatchObject({
      roles: ["subject"],
      predicateFrame: "none",
      standaloneKind: "lexical-prompt",
    });
    expect(result.annotations[entries[1]!.id]).toMatchObject({
      roles: ["transitive-predicate", "verb"],
      predicateFrame: "transitive",
    });
  });

  it("rejects missing entries and inconsistent predicate frames", () => {
    const entries = [
      entry("老師", "ㄌㄠ3 ㄕ1"),
      entry("使用", "ㄕ3 ㄩㄥ4"),
    ];
    const source = `text,reading,roles,predicate_frame,standalone_kind,provenance_ids
老師,ㄌㄠ3 ㄕ1,subject,transitive,lexical-prompt,test:grammar
`;
    const result = compileGrammarAnnotations(parseCsv(source).records, entries, provenance);
    expect(result.errors.map((error) => error.code)).toContain("inconsistent-predicate-frame");
    expect(result.errors).toContainEqual(expect.objectContaining({
      code: "missing-annotation",
      text: "使用",
    }));
  });

  it("requires formulaic entries to be standalone utterances", () => {
    const entries = [entry("謝謝", "ㄒㄧㄝ4 ㄒㄧㄝ5")];
    const source = `text,reading,roles,predicate_frame,standalone_kind,provenance_ids
謝謝,ㄒㄧㄝ4 ㄒㄧㄝ5,formulaic;object,none,lexical-prompt,test:grammar
`;
    const result = compileGrammarAnnotations(parseCsv(source).records, entries, provenance);
    expect(result.errors.map((error) => error.code)).toContain("invalid-formulaic-role");
  });
});

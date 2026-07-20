import { describe, expect, it } from "vitest";
import type { CatalogEntry } from "../../src/core/model.js";
import { composeGrammarCandidates } from "../../src/grammar/compose.js";
import type { GrammarAnnotation } from "../../src/grammar/types.js";

function entry(id: string, text: string): CatalogEntry {
  return {
    id,
    prompt: { text, locale: "zh-TW" },
    syllables: [{ tokens: ["zhuyin:ㄅ", "tone:1"] }],
    frequencyBand: 1,
    tags: ["test"],
    provenanceIds: ["test:grammar"],
  };
}

function annotation(
  entryId: string,
  roles: GrammarAnnotation["roles"],
  predicateFrame: GrammarAnnotation["predicateFrame"] = "none",
  standaloneKind: GrammarAnnotation["standaloneKind"] = "lexical-prompt",
): GrammarAnnotation {
  return {
    entryId,
    roles,
    predicateFrame,
    standaloneKind,
    provenanceIds: ["test:grammar"],
  };
}

const entries = [
  entry("today", "今天"),
  entry("we", "我們"),
  entry("start", "開始"),
  entry("practice", "練習"),
  entry("teacher", "老師"),
  entry("can", "可以"),
  entry("use", "使用"),
  entry("computer", "電腦"),
  entry("mother", "媽媽"),
  entry("now", "現在"),
  entry("see", "看到"),
  entry("moon", "月亮"),
  entry("thanks", "謝謝"),
];

const annotations: Readonly<Record<string, GrammarAnnotation>> = {
  today: annotation("today", ["temporal"]),
  we: annotation("we", ["subject"]),
  start: annotation("start", ["modal"], "modal"),
  practice: annotation("practice", ["object", "transitive-predicate", "verb"], "transitive"),
  teacher: annotation("teacher", ["subject"]),
  can: annotation("can", ["modal"], "modal"),
  use: annotation("use", ["transitive-predicate", "verb"], "transitive"),
  computer: annotation("computer", ["subject", "object"]),
  mother: annotation("mother", ["subject"]),
  now: annotation("now", ["temporal"]),
  see: annotation("see", ["transitive-predicate", "verb"], "transitive"),
  moon: annotation("moon", ["subject", "object"]),
  thanks: annotation("thanks", ["formulaic"], "none", "utterance"),
};

describe("grammar-aware composition", () => {
  it("enumerates complete Mandarin template candidates", () => {
    const result = composeGrammarCandidates(entries, annotations);
    const texts = new Set(result.candidates.map((candidate) => candidate.text));
    expect(texts).toContain("今天 我們 開始 練習");
    expect(texts).toContain("老師 可以 使用 電腦");
    expect(texts).toContain("媽媽 現在 看到 月亮");
    expect(texts).toContain("謝謝");
    expect(result.fallbackReasons).toEqual([]);
  });

  it("never places formulaic utterances into ordinary slots", () => {
    const result = composeGrammarCandidates(entries, annotations);
    const ordinary = result.candidates.filter((candidate) =>
      candidate.templateId !== "formulaic-utterance"
    );
    expect(ordinary.every((candidate) =>
      candidate.entries.every((candidateEntry) => candidateEntry.id !== "thanks")
    )).toBe(true);
  });

  it("is invariant to entry and annotation input order", () => {
    const forward = composeGrammarCandidates(entries, annotations, undefined, {
      maximumCandidates: 300,
    });
    const reversedAnnotations = Object.fromEntries(Object.entries(annotations).reverse());
    const reversed = composeGrammarCandidates([...entries].reverse(), reversedAnnotations, undefined, {
      maximumCandidates: 300,
    });
    expect(reversed).toEqual(forward);
  });

  it("falls back to a reviewed standalone utterance before lexical prompts", () => {
    const onlyStandalone = [entries.find((candidate) => candidate.id === "thanks")!];
    const result = composeGrammarCandidates(onlyStandalone, annotations, []);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      kind: "standalone-utterance",
      text: "謝謝",
    });
    expect(result.fallbackReasons).toEqual([
      "no-complete-template",
      "standalone-utterance",
    ]);
  });

  it("rejects unannotated entries instead of concatenating them", () => {
    expect(() => composeGrammarCandidates(entries, {
      ...annotations,
      moon: undefined as never,
    })).toThrow("grammar annotations missing for: moon");
  });
});

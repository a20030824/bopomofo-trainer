import { describe, expect, it } from "vitest";
import type { Exercise } from "../../src/core/model.js";
import {
  EVALUATION_CATALOG,
  PRACTICE_CATALOG,
} from "../../src/app/generated/catalog.js";
import {
  buildPracticeEntries,
  buildPracticeGlyphs,
  continuousExerciseText,
  planBalancedPracticeLines,
} from "../../src/app/presentation-model.js";

const exercise: Exercise = {
  id: "exercise:test",
  mode: "guided",
  layoutId: "zhuyin-standard",
  entries: [
    {
      id: "我們|ㄨㄛ3 ㄇㄣ5",
      prompt: { text: "我們", locale: "zh-TW" },
      syllables: [
        { tokens: ["zhuyin:ㄨ", "zhuyin:ㄛ", "tone:3"] },
        { tokens: ["zhuyin:ㄇ", "zhuyin:ㄣ", "tone:5"] },
      ],
      frequencyBand: 1,
      tags: [],
      provenanceIds: [],
    },
    {
      id: "今天|ㄐㄧㄣ1 ㄊㄧㄢ1",
      prompt: { text: "今天", locale: "zh-TW" },
      syllables: [
        { tokens: ["zhuyin:ㄐ", "zhuyin:ㄧ", "zhuyin:ㄣ", "tone:1"] },
        { tokens: ["zhuyin:ㄊ", "zhuyin:ㄧ", "zhuyin:ㄢ", "tone:1"] },
      ],
      frequencyBand: 1,
      tags: [],
      provenanceIds: [],
    },
  ],
};

describe("continuous practice presentation", () => {
  it("joins entries without exposing word boundaries in the display text", () => {
    expect(continuousExerciseText(exercise)).toBe("我們今天");
  });

  it("aligns each character with one syllable while retaining token positions", () => {
    expect(buildPracticeGlyphs(exercise)).toEqual([
      expect.objectContaining({ character: "我", entryIndex: 0, tokenStart: 0, tokenEnd: 3 }),
      expect.objectContaining({ character: "們", entryIndex: 0, tokenStart: 3, tokenEnd: 6 }),
      expect.objectContaining({ character: "今", entryIndex: 1, tokenStart: 6, tokenEnd: 10 }),
      expect.objectContaining({ character: "天", entryIndex: 1, tokenStart: 10, tokenEnd: 14 }),
    ]);
  });

  it("retains invisible entry groups as legal line-break units", () => {
    expect(buildPracticeEntries(exercise)).toEqual([
      expect.objectContaining({
        entryId: "我們|ㄨㄛ3 ㄇㄣ5",
        entryIndex: 0,
        tokenStart: 0,
        tokenEnd: 6,
        glyphs: [
          expect.objectContaining({ character: "我" }),
          expect.objectContaining({ character: "們" }),
        ],
      }),
      expect.objectContaining({
        entryId: "今天|ㄐㄧㄣ1 ㄊㄧㄢ1",
        entryIndex: 1,
        tokenStart: 6,
        tokenEnd: 14,
        glyphs: [
          expect.objectContaining({ character: "今" }),
          expect.objectContaining({ character: "天" }),
        ],
      }),
    ]);
  });

  it("keeps a short utterance on one line", () => {
    expect(planBalancedPracticeLines([200, 300], 600)).toEqual([
      { startEntryIndex: 0, endEntryIndex: 2, width: 500 },
    ]);
  });

  it("redistributes entries instead of leaving a short final orphan", () => {
    expect(planBalancedPracticeLines([500, 150, 100], 700)).toEqual([
      { startEntryIndex: 0, endEntryIndex: 1, width: 500 },
      { startEntryIndex: 1, endEntryIndex: 3, width: 250 },
    ]);
  });

  it("keeps entry order and prefers the fuller first line on equal-cost breaks", () => {
    expect(planBalancedPracticeLines([350, 350, 350], 700)).toEqual([
      { startEntryIndex: 0, endEntryIndex: 2, width: 700 },
      { startEntryIndex: 2, endEntryIndex: 3, width: 350 },
    ]);
  });

  it("keeps every active catalog entry character-aligned", () => {
    for (const entry of [...PRACTICE_CATALOG, ...EVALUATION_CATALOG]) {
      expect(
        Array.from(entry.prompt.text).length,
        entry.id,
      ).toBe(entry.syllables.length);
    }
  });

  it("keeps each displayed syllable within four symbols including its tone", () => {
    let maximumTokenCount = 0;
    for (const entry of [...PRACTICE_CATALOG, ...EVALUATION_CATALOG]) {
      for (const syllable of entry.syllables) {
        maximumTokenCount = Math.max(maximumTokenCount, syllable.tokens.length);
        expect(syllable.tokens.length, entry.id).toBeGreaterThan(0);
        expect(syllable.tokens.length, entry.id).toBeLessThanOrEqual(4);
        expect(syllable.tokens.at(-1)?.startsWith("tone:"), entry.id).toBe(true);
      }
    }
    expect(maximumTokenCount).toBe(4);
  });

  it("fails closed when reviewed characters and syllables cannot align", () => {
    const malformed: Exercise = {
      ...exercise,
      entries: [{
        ...exercise.entries[0]!,
        prompt: { text: "測試", locale: "zh-TW" },
        syllables: [{ tokens: ["tone:1"] }],
      }],
    };
    expect(() => buildPracticeEntries(malformed)).toThrow(
      "Cannot align practice entry 我們|ㄨㄛ3 ㄇㄣ5: 2 characters for 1 syllables",
    );
  });
});

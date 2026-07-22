import { describe, expect, it } from "vitest";
import type { Exercise } from "../../src/core/model.js";
import {
  buildPracticeGlyphs,
  continuousExerciseText,
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
  it("joins entries without exposing word boundaries", () => {
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

  it("keeps a multi-character prompt intact when it has one reviewed syllable", () => {
    const compact: Exercise = {
      ...exercise,
      entries: [{ ...exercise.entries[0]!, prompt: { text: "測試", locale: "zh-TW" }, syllables: [{ tokens: ["tone:1"] }] }],
    };
    expect(buildPracticeGlyphs(compact)[0]?.character).toBe("測試");
  });
});

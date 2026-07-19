import type { CatalogEntry } from "../../src/core/model.js";

export function entry(id: string, tone: 1 | 2 = 1): CatalogEntry {
  return {
    id,
    prompt: { text: id, locale: "zh-TW" },
    syllables: [
      { tokens: ["zhuyin:ㄇ", "zhuyin:ㄚ", `tone:${tone}`] },
      { tokens: ["zhuyin:ㄅ", "zhuyin:ㄛ", "tone:2"] },
    ],
    frequencyBand: 1,
    tags: ["test"],
    provenanceIds: ["test"],
  };
}

export const PRACTICE = Array.from({ length: 8 }, (_, index) =>
  entry(`practice-${index + 1}`, index % 2 === 0 ? 1 : 2),
);
export const EVALUATION = Array.from({ length: 4 }, (_, index) =>
  entry(`evaluation-${index + 1}`, index % 2 === 0 ? 1 : 2),
);

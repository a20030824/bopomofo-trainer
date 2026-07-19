import type { CatalogEntry } from "../../src/core/model.js";
import type { BindingAggregate } from "../../src/measurement/types.js";
import { createEmptyCurriculumProfile, profileFromAggregates } from "../../src/curriculum/simulator.js";
import { createCatalogSupportIndex } from "../../src/curriculum/support.js";
import type { CurriculumProfile } from "../../src/curriculum/types.js";

function entry(id: string, frequencyBand: 1 | 2 | 3, tokens: readonly string[]): CatalogEntry {
  return { id, prompt: { text: id, locale: "zh-TW" }, syllables: [{ tokens }], frequencyBand, tags: ["test"], provenanceIds: ["test"] };
}

export const catalog = [
  entry("e1", 1, ["token:A", "token:B", "tone:1"]),
  entry("e2", 1, ["token:A", "token:B", "tone:2"]),
  entry("e3", 2, ["token:A", "token:B", "tone:3"]),
  entry("e4", 1, ["token:A", "token:D", "tone:1"]),
  entry("e5", 3, ["token:C", "token:C", "tone:4"]),
  entry("e6", 2, ["token:D", "tone:5"]),
  entry("e7", 1, ["token:A", "token:B", "tone:5"]),
  entry("e8", 2, ["token:A", "token:D", "tone:2"]),
] as const;

export const support = createCatalogSupportIndex(catalog);

export function aggregate(profile: CurriculumProfile, tokenId: string, timingMs: number, errorRate: number, attempts = 12): BindingAggregate {
  const record = profile.bindings[tokenId];
  if (record === undefined) throw new Error(`unknown test token ${tokenId}`);
  return {
    scope: record.scope, attempts, errors: Math.round(attempts * errorRate), timingSamples: attempts,
    currentTimeToTypeMs: timingMs, bestTimeToTypeMs: timingMs * 0.8,
    timingExclusions: { syllableStart: 0, incorrect: 0, recovery: 0, interactionNoise: 0 },
  };
}

export function eligibleProfile(overrides: Readonly<Record<string, { timingMs: number; errorRate: number }>> = {}) {
  const empty = createEmptyCurriculumProfile(support, "guided", "zhuyin-standard");
  const aggregates = Object.keys(support.byToken).map((tokenId) => {
    const value = overrides[tokenId] ?? { timingMs: 180, errorRate: 0.02 };
    return aggregate(empty, tokenId, value.timingMs, value.errorRate);
  });
  return profileFromAggregates(support, "guided", "zhuyin-standard", aggregates);
}

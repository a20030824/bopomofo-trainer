import { describe, expect, it } from "vitest";
import type { CatalogEntry, RandomSource } from "../../src/core/model.js";
import {
  FREQUENCY_FIRST_UTTERANCE_POLICY,
  selectFrequencyFirstUtterance,
} from "../../src/curriculum/frequency-first-utterance.js";
import type { GrammarAnnotation } from "../../src/grammar/types.js";
import type { MeasurementSummary } from "../../src/measurement/types.js";

const measurement: MeasurementSummary = {
  policyVersion: "fixture",
  traceCount: 0,
  bindingObservationCount: 0,
  confusionObservationCount: 0,
  transitionObservationCount: 0,
  bindings: {},
  confusions: {},
  transitions: {},
};
const random: RandomSource = { next: () => 0 };

function entry(
  id: string,
  band: 1 | 2 | 3,
  selectionWeight?: number,
): CatalogEntry {
  const commonness = selectionWeight === undefined
    ? {}
    : {
      commonnessBase: {
        modelVersion: "commonness-v1",
        sourceId: "fixture",
        sourceVersion: "1",
        sourceRowId: id,
        spokenPerMillion: 1,
        writtenPerMillion: 1,
        spokenStrength: 1,
        writtenStrength: 1,
        score: selectionWeight,
        selectionWeight,
        confidence: "reviewed" as const,
        reasons: ["fixture"],
      },
    };
  return {
    id,
    prompt: { text: id, locale: "zh-TW" },
    syllables: [{ tokens: [id] }],
    frequencyBand: band,
    ...commonness,
    tags: [],
    provenanceIds: [],
  };
}

function annotation(id: string): GrammarAnnotation {
  return {
    entryId: id,
    roles: ["formulaic"],
    predicateFrame: "none",
    standaloneKind: "utterance",
    provenanceIds: [],
  };
}

function select(
  entries: readonly CatalogEntry[],
  stage: 1 | 2 | 3 = 3,
) {
  return selectFrequencyFirstUtterance({
    entries,
    annotations: Object.fromEntries(
      entries.map((item) => [item.id, annotation(item.id)]),
    ),
    measurement,
    mode: "guided",
    layoutId: "standard",
    stage,
    history: {
      recentEntryIds: [],
      recentUtteranceIds: [],
      recentTemplateIds: [],
    },
    policy: FREQUENCY_FIRST_UTTERANCE_POLICY,
    random,
  });
}

describe("commonness-backed utterance selection", () => {
  it("uses reviewed commonness and falls back to frequency band", () => {
    const result = select([
      entry("projected", 3, 0.8),
      entry("fallback", 2),
    ]);
    const candidates = result.slotSelections[0]?.candidates ?? [];
    const projected = candidates.find((item) => item.entryId === "projected")!;
    const fallback = candidates.find((item) => item.entryId === "fallback")!;
    expect(projected.frequencyBase).toBe(0.8);
    expect(fallback.frequencyBase).toBe(0.5);
  });

  it("keeps frequencyBand stage eligibility unchanged", () => {
    const result = select([
      entry("locked", 3, 1),
      entry("eligible", 1, 0.05),
    ], 1);
    expect(result.slotSelections[0]?.candidates.map((item) => item.entryId))
      .toEqual(["eligible"]);
  });
});

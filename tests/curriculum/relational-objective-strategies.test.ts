import { describe, expect, it } from "vitest";
import type { CatalogEntry, RandomSource } from "../../src/core/model.js";
import {
  bindingScopeKey,
  confusionScopeKey,
  transitionScopeKey,
} from "../../src/measurement/aggregate.js";
import type { MeasurementSummary } from "../../src/measurement/types.js";
import { selectRelationalObjective } from "../../src/curriculum/relational-objective-strategies.js";
import { createRelationalCatalogReport } from "../../src/relations/catalog-report.js";
import type { ConfusionRelationRef } from "../../src/relations/types.js";
import { STANDARD_BOPOMOFO_LAYOUT } from "../../src/scheme/standard-layout.js";
import { toneToken, zhuyinToken } from "../../src/scheme/tokens.js";

const BO = zhuyinToken("ㄅ");
const PO = zhuyinToken("ㄆ");
const ZHI = zhuyinToken("ㄓ");
const U = zhuyinToken("ㄨ");
const TONE = toneToken(1);

function entry(id: string, tokens: readonly string[]): CatalogEntry {
  return {
    id,
    prompt: { text: id, locale: "zh-TW" },
    syllables: [{ tokens }],
    frequencyBand: 1,
    tags: ["objective-test", "common"],
    provenanceIds: ["objective-test"],
  };
}

const entries = [
  entry("zhu-a", [ZHI, U, TONE]),
  entry("zhu-b", [ZHI, U, TONE]),
  entry("bo-po-a", [BO, PO, TONE]),
  entry("bo-po-b", [BO, PO, TONE]),
] as const;

const confusion: ConfusionRelationRef = {
  kind: "confusion",
  scope: {
    mode: "guided",
    layoutId: STANDARD_BOPOMOFO_LAYOUT.id,
    expectedToken: BO,
    actualToken: PO,
  },
};

const report = createRelationalCatalogReport(entries, {
  mode: "guided",
  layoutId: STANDARD_BOPOMOFO_LAYOUT.id,
  partitionByEntryId: Object.fromEntries(entries.map((item) => [item.id, "training"])),
  confusionRelations: [confusion],
});

function emptyMeasurement(): MeasurementSummary {
  return {
    policyVersion: "test",
    traceCount: 0,
    bindingObservationCount: 0,
    confusionObservationCount: 0,
    transitionObservationCount: 0,
    bindings: {},
    confusions: {},
    transitions: {},
  };
}

function measured(): MeasurementSummary {
  const boScope = {
    mode: "guided" as const,
    layoutId: STANDARD_BOPOMOFO_LAYOUT.id,
    tokenId: BO,
  };
  const uScope = {
    mode: "guided" as const,
    layoutId: STANDARD_BOPOMOFO_LAYOUT.id,
    tokenId: U,
  };
  const edgeScope = {
    mode: "guided" as const,
    layoutId: STANDARD_BOPOMOFO_LAYOUT.id,
    fromToken: ZHI,
    toToken: U,
  };
  return {
    policyVersion: "test",
    traceCount: 30,
    bindingObservationCount: 20,
    confusionObservationCount: 5,
    transitionObservationCount: 10,
    bindings: {
      [bindingScopeKey(boScope)]: {
        scope: boScope,
        attempts: 10,
        errors: 6,
        timingSamples: 0,
        currentTimeToTypeMs: null,
        bestTimeToTypeMs: null,
        timingExclusions: {
          syllableStart: 10,
          incorrect: 0,
          recovery: 0,
          interactionNoise: 0,
        },
      },
      [bindingScopeKey(uScope)]: {
        scope: uScope,
        attempts: 10,
        errors: 1,
        timingSamples: 5,
        currentTimeToTypeMs: 100,
        bestTimeToTypeMs: 90,
        timingExclusions: {
          syllableStart: 0,
          incorrect: 1,
          recovery: 0,
          interactionNoise: 0,
        },
      },
    },
    confusions: {
      [confusionScopeKey(confusion.scope)]: {
        scope: confusion.scope,
        occurrences: 5,
      },
    },
    transitions: {
      [transitionScopeKey(edgeScope)]: {
        scope: edgeScope,
        timingSamples: 10,
        currentTimeToTypeMs: 500,
        bestTimeToTypeMs: 450,
      },
    },
  };
}

function random(value: number): RandomSource {
  return { next: () => value };
}

function context(measurement: MeasurementSummary, value = 0) {
  return {
    round: measurement.traceCount === 0 ? 0 : 1,
    mode: "guided" as const,
    layoutId: STANDARD_BOPOMOFO_LAYOUT.id,
    relationReport: report,
    measurement,
    recentObjectives: [],
    random: random(value),
  };
}

describe("relational objective selectors", () => {
  it("uses explicit support-driven fallbacks before measurements exist", () => {
    for (const id of [
      "binding-only-baseline",
      "transition-aware",
      "confusion-aware",
      "combined-relational",
    ] as const) {
      const decision = selectRelationalObjective(id, context(emptyMeasurement()));
      expect(decision.objective.kind).not.toBe("coverage");
      expect(decision.fallbackReason).toContain("round-zero");
      expect(decision.candidates.every((candidate) => candidate.supportCount > 0)).toBe(true);
    }
  });

  it("uses cumulative measurements for binding, transition, and confusion choices", () => {
    const binding = selectRelationalObjective("binding-only-baseline", context(measured()));
    const transition = selectRelationalObjective("transition-aware", context(measured()));
    const confusionDecision = selectRelationalObjective("confusion-aware", context(measured()));

    expect(binding.objective).toMatchObject({
      kind: "binding",
      relation: { scope: { tokenId: BO } },
    });
    expect(transition.objective).toMatchObject({
      kind: "transition",
      relation: { scope: { fromToken: ZHI, toToken: U } },
    });
    expect(confusionDecision.objective).toEqual({ kind: "confusion", relation: confusion });
    expect(binding.fallbackReason).toBeNull();
    expect(transition.fallbackReason).toBeNull();
    expect(confusionDecision.fallbackReason).toBeNull();
  });

  it("replays frequency sampling for a fixed random value", () => {
    const first = selectRelationalObjective("frequency-random", context(emptyMeasurement(), 0.42));
    const replay = selectRelationalObjective("frequency-random", context(emptyMeasurement(), 0.42));
    expect(replay).toEqual(first);
    expect(first.fallbackReason).toBe("round-zero-frequency-support-sampling");
  });

  it("rejects invalid random values", () => {
    expect(() => selectRelationalObjective(
      "frequency-random",
      context(emptyMeasurement(), 1),
    )).toThrow("objective random source must return a finite value in [0, 1)");
  });
});

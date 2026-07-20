import { describe, expect, it } from "vitest";
import {
  canonicalizeRelationalExperimentPlan,
  deriveExperimentSeed,
  relationalExperimentPlanDigest,
} from "../../../src/simulation/experiment/plan.js";
import type { RelationalExperimentPlan } from "../../../src/simulation/experiment/types.js";

function plan(): RelationalExperimentPlan {
  return {
    schemaVersion: "relational-experiment-plan-v1",
    id: "test-plan",
    catalog: [{
      id: "entry",
      prompt: { text: "中", locale: "zh-TW" },
      syllables: [{ tokens: ["zhuyin:ㄓ", "zhuyin:ㄨ", "tone:1"] }],
      frequencyBand: 1,
      tags: ["test"],
      provenanceIds: ["test"],
    }],
    confusionRelations: [],
    matrixOptions: {
      objectiveStrategyIds: ["binding-only-baseline"],
      partitionPolicyIds: ["binding-preserving-baseline-v1"],
      compositionStrategyIds: ["fixed-six-baseline"],
      learnerModelIds: ["synthetic-relational-v1"],
    },
    scenarioIds: ["weak-transition", "weak-binding"],
    seeds: [9, 2],
    rounds: 1,
    partitionOptions: {
      evaluationEntryCount: 0,
      minimumTrainingDistinctEntries: 1,
    },
    frequencyAllowCrossBandFallback: true,
    practiceBudget: {
      targetExposures: { minimum: 1, preferred: 1, maximum: 1 },
      maximumTokens: 8,
      maximumSyllables: 2,
      maximumLexicalBoundaries: 1,
      minimumCommonWordShare: 0,
      maximumSameEntryRepetition: 1,
      maximumRelationConcentration: 1,
      recentEntryPenalty: 0,
      recentTokenPathPenalty: 0,
      marginalGainThreshold: 0,
    },
    beamWidth: 2,
    startTimestampMs: 1000,
    roundTimestampStepMs: 100,
  };
}

describe("relational experiment plans", () => {
  it("canonicalizes scenario, seed, and catalog order before digesting", () => {
    const first = plan();
    const reversed = {
      ...first,
      scenarioIds: [...first.scenarioIds].reverse(),
      seeds: [...first.seeds].reverse(),
    };
    expect(canonicalizeRelationalExperimentPlan(first)).toEqual(
      canonicalizeRelationalExperimentPlan(reversed),
    );
    expect(relationalExperimentPlanDigest(first)).toBe(
      relationalExperimentPlanDigest(reversed),
    );
  });

  it("derives stable stage-specific unsigned seeds", () => {
    const first = deriveExperimentSeed("plan", "cell", 1, "objective");
    expect(first).toBe(deriveExperimentSeed("plan", "cell", 1, "objective"));
    expect(first).not.toBe(deriveExperimentSeed("plan", "cell", 1, "learner"));
    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThanOrEqual(0xffffffff);
  });

  it("rejects empty identities, duplicate dimensions, and invalid counts", () => {
    expect(() => canonicalizeRelationalExperimentPlan({ ...plan(), id: " " }))
      .toThrow("experiment plan id must not be empty");
    expect(() => canonicalizeRelationalExperimentPlan({
      ...plan(),
      scenarioIds: ["weak-binding", "weak-binding"],
    })).toThrow("scenarioIds must not contain duplicates");
    expect(() => canonicalizeRelationalExperimentPlan({ ...plan(), rounds: 0 }))
      .toThrow("experiment rounds must be a positive integer");
    expect(() => canonicalizeRelationalExperimentPlan({ ...plan(), beamWidth: 1.5 }))
      .toThrow("experiment beamWidth must be a positive integer");
  });
});

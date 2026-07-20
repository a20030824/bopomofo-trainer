import { describe, expect, it } from "vitest";
import { stableStringify } from "../../../src/composition/stable.js";
import {
  SYNTHETIC_SCENARIO_IDS,
  getSyntheticScenario,
} from "../../../src/simulation/learner/scenarios.js";

describe("heterogeneous improvement scenario", () => {
  it("declares relation-specific learning rates deterministically", () => {
    const first = getSyntheticScenario("heterogeneous-improvement");
    const replay = getSyntheticScenario("heterogeneous-improvement");
    const bindingRates = new Set(
      Object.values(first.learner.bindings).map((truth) => truth.learningRate),
    );
    const transitionRates = new Set(
      Object.values(first.learner.transitions).map((truth) => truth.learningRate),
    );
    const confusionRates = new Set(
      Object.values(first.learner.confusions).map((truth) => truth.learningRate),
    );

    expect(SYNTHETIC_SCENARIO_IDS).toContain("heterogeneous-improvement");
    expect(bindingRates.size).toBeGreaterThan(1);
    expect(transitionRates.size).toBeGreaterThan(1);
    expect(confusionRates.size).toBe(1);
    expect(stableStringify(replay)).toBe(stableStringify(first));
  });
});

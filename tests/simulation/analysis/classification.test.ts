import { expect, it } from "vitest";
import { classifyCellScenario } from "../../../src/simulation/analysis/compare.js";
import { RELATIONAL_ANALYSIS_POLICY } from "../../../src/simulation/analysis/policy.js";
import type { MetricComparison } from "../../../src/simulation/analysis/types.js";

function comparison(
  metric: MetricComparison["metric"],
  materialImprovement: boolean,
  materialRegression: boolean,
): MetricComparison {
  const rule = RELATIONAL_ANALYSIS_POLICY.metrics[metric];
  return {
    metric,
    direction: rule.direction,
    role: rule.role,
    status: "identifiable",
    cellMean: 1,
    baselineMean: 1,
    absoluteDelta: 0,
    relativeDelta: 0,
    improvement: 0,
    relativeImprovement: 0,
    materialImprovement,
    materialRegression,
    cellSamples: 2,
    cellMissing: 0,
    baselineSamples: 2,
    baselineMissing: 0,
    reason: "test-fixture",
  };
}

it("does not call contradictory primary evidence a candidate", () => {
  const result = classifyCellScenario(
    "candidate-cell",
    "asymmetric-confusion",
    4,
    0,
    0,
    [
      comparison("weaknessIdentificationDelayRounds", true, false),
      comparison("confusionEstimateMeanAbsoluteError", false, true),
      comparison("confusionReduction", false, false),
    ],
    RELATIONAL_ANALYSIS_POLICY,
    "baseline-cell",
  );

  expect(result).toEqual({
    recommendation: "inconclusive",
    recommendationReasons: [
      "contradictory-primary-regression:confusionEstimateMeanAbsoluteError",
    ],
  });
});

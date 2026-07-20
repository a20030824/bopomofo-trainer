import type { RelationalAnalysisPolicy } from "./types.js";

export const RELATIONAL_ANALYSIS_POLICY: RelationalAnalysisPolicy = {
  schemaVersion: "relational-analysis-policy-v1",
  version: "phase-7g-v1",
  maximumFallbackRate: 0.25,
  metrics: {
    weaknessIdentificationDelayRounds: {
      direction: "lower-is-better", role: "primary",
      materialAbsoluteDelta: 0.5, materialRelativeDelta: 0.1,
    },
    bindingEstimateMeanAbsoluteError: {
      direction: "lower-is-better", role: "primary",
      materialAbsoluteDelta: 0.01, materialRelativeDelta: 0.1,
    },
    transitionEstimateMeanAbsoluteErrorMs: {
      direction: "lower-is-better", role: "primary",
      materialAbsoluteDelta: 5, materialRelativeDelta: 0.1,
    },
    confusionEstimateMeanAbsoluteError: {
      direction: "lower-is-better", role: "primary",
      materialAbsoluteDelta: 0.01, materialRelativeDelta: 0.1,
    },
    targetExposurePerToken: {
      direction: "descriptive-only", role: "descriptive",
      materialAbsoluteDelta: 0, materialRelativeDelta: 0,
    },
    relationCoverage: {
      direction: "higher-is-better", role: "primary",
      materialAbsoluteDelta: 0.05, materialRelativeDelta: 0.1,
    },
    heldOutTransferProxy: {
      direction: "higher-is-better", role: "primary",
      materialAbsoluteDelta: 0.01, materialRelativeDelta: 0.1,
    },
    lexicalConcentration: {
      direction: "lower-is-better", role: "protected",
      materialAbsoluteDelta: 0.05, materialRelativeDelta: 0.1,
    },
    repeatedEntryRate: {
      direction: "lower-is-better", role: "protected",
      materialAbsoluteDelta: 0.05, materialRelativeDelta: 0.1,
    },
    fallbackRate: {
      direction: "lower-is-better", role: "protected",
      materialAbsoluteDelta: 0.05, materialRelativeDelta: 0.1,
    },
    failureRate: {
      direction: "lower-is-better", role: "protected",
      materialAbsoluteDelta: 0, materialRelativeDelta: 0,
    },
    costPerLatentImprovement: {
      direction: "lower-is-better", role: "protected",
      materialAbsoluteDelta: 0, materialRelativeDelta: 0.1,
    },
    confusionReduction: {
      direction: "higher-is-better", role: "primary",
      materialAbsoluteDelta: 0.01, materialRelativeDelta: 0.1,
    },
  },
  scenarioPrimaryMetrics: {
    "weak-binding": [
      "weaknessIdentificationDelayRounds",
      "bindingEstimateMeanAbsoluteError",
      "relationCoverage",
    ],
    "weak-transition": [
      "weaknessIdentificationDelayRounds",
      "transitionEstimateMeanAbsoluteErrorMs",
      "relationCoverage",
    ],
    "asymmetric-confusion": [
      "weaknessIdentificationDelayRounds",
      "confusionEstimateMeanAbsoluteError",
      "confusionReduction",
    ],
  },
};

import { RELATIONAL_ANALYSIS_POLICY } from "../analysis/policy.js";
import type { RelationalConfirmationPolicy } from "./types.js";

export const RELATIONAL_CONFIRMATION_POLICY: RelationalConfirmationPolicy = {
  schemaVersion: "relational-confirmation-policy-v1",
  version: "phase-7h-v2",
  sourceAnalysisPolicyVersion: RELATIONAL_ANALYSIS_POLICY.version,
  maximumBlockingFallbackRate: RELATIONAL_ANALYSIS_POLICY.maximumBlockingFallbackRate,
  minimumSurvivingSeedShare: 0.8,
  minimumScenarioLimitedSeedShare: 0.5,
  maximumRejectedSeedShare: 0.2,
  minimumRobustScenarioShare: 0.5,
  scenarioPrimaryMetrics: {
    ...RELATIONAL_ANALYSIS_POLICY.scenarioPrimaryMetrics,
    "competing-weaknesses": [
      "weaknessIdentificationDelayRounds",
      "bindingEstimateMeanAbsoluteError",
      "transitionEstimateMeanAbsoluteErrorMs",
      "confusionEstimateMeanAbsoluteError",
      "relationCoverage",
    ],
    "high-noise": [
      "bindingEstimateMeanAbsoluteError",
      "transitionEstimateMeanAbsoluteErrorMs",
      "relationCoverage",
    ],
    "retention-decay": [
      "bindingEstimateMeanAbsoluteError",
      "transitionEstimateMeanAbsoluteErrorMs",
      "costPerLatentImprovement",
    ],
    "heterogeneous-improvement": [
      "weaknessIdentificationDelayRounds",
      "bindingEstimateMeanAbsoluteError",
      "transitionEstimateMeanAbsoluteErrorMs",
      "confusionEstimateMeanAbsoluteError",
      "relationCoverage",
    ],
  },
};

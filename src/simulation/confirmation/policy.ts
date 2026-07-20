import { RELATIONAL_ANALYSIS_POLICY } from "../analysis/policy.js";
import type { ExperimentMetricKey } from "../analysis/types.js";

export interface RelationalConfirmationPolicy {
  readonly schemaVersion: "relational-confirmation-policy-v1";
  readonly version: string;
  readonly sourceAnalysisPolicyVersion: string;
  readonly maximumBlockingFallbackRate: number;
  readonly minimumSurvivingSeedShare: number;
  readonly minimumScenarioLimitedSeedShare: number;
  readonly scenarioPrimaryMetrics: Readonly<Record<string, readonly ExperimentMetricKey[]>>;
}

export const RELATIONAL_CONFIRMATION_POLICY: RelationalConfirmationPolicy = {
  schemaVersion: "relational-confirmation-policy-v1",
  version: "phase-7h-v1",
  sourceAnalysisPolicyVersion: RELATIONAL_ANALYSIS_POLICY.version,
  maximumBlockingFallbackRate: RELATIONAL_ANALYSIS_POLICY.maximumBlockingFallbackRate,
  minimumSurvivingSeedShare: 0.8,
  minimumScenarioLimitedSeedShare: 0.5,
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
      "confusionEstimateMeanAbsoluteError",
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

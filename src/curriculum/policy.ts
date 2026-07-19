import type { CurriculumPolicy } from "./types.js";

export const PHASE_4_CURRICULUM_POLICY: CurriculumPolicy = {
  version: "phase-4-v1",
  minimumAttempts: 8,
  minimumTimingSamples: 5,
  minimumCatalogEntries: 3,
  coverageTargetAttempts: 3,
  toneCoverageTargetAttempts: 4,
  exerciseEntryCount: 6,
  focusedEntryShare: 0.5,
  focusedEntryBoost: 3,
  cooldownRounds: 2,
  errorWeight: 0.6,
  timingWeight: 0.4,
  frequencyBandWeights: { 1: 1, 2: 0.6, 3: 0.3 },
  recentEntryPenalty: 0.15,
  recentTokenPenalty: 0.85,
};

export function validateCurriculumPolicy(policy: CurriculumPolicy): void {
  const positiveIntegers = [
    policy.minimumAttempts,
    policy.minimumTimingSamples,
    policy.minimumCatalogEntries,
    policy.coverageTargetAttempts,
    policy.toneCoverageTargetAttempts,
    policy.exerciseEntryCount,
  ];
  if (positiveIntegers.some((value) => !Number.isInteger(value) || value <= 0)) {
    throw new RangeError("curriculum count thresholds must be positive integers");
  }
  if (!Number.isInteger(policy.cooldownRounds) || policy.cooldownRounds < 0) {
    throw new RangeError("cooldownRounds must be a non-negative integer");
  }
  if (policy.focusedEntryShare < 0 || policy.focusedEntryShare > 1) {
    throw new RangeError("focusedEntryShare must be between 0 and 1");
  }
  if (!Number.isFinite(policy.focusedEntryBoost) || policy.focusedEntryBoost < 1) {
    throw new RangeError("focusedEntryBoost must be finite and at least 1");
  }
  if (policy.errorWeight <= 0 || policy.timingWeight < 0) {
    throw new RangeError("errorWeight must be positive and timingWeight must be non-negative");
  }
  if (policy.recentEntryPenalty <= 0 || policy.recentEntryPenalty > 1) {
    throw new RangeError("recentEntryPenalty must be greater than 0 and at most 1");
  }
  if (policy.recentTokenPenalty <= 0 || policy.recentTokenPenalty > 1) {
    throw new RangeError("recentTokenPenalty must be greater than 0 and at most 1");
  }
  for (const weight of Object.values(policy.frequencyBandWeights)) {
    if (!Number.isFinite(weight) || weight <= 0) {
      throw new RangeError("frequency band weights must be finite and positive");
    }
  }
}

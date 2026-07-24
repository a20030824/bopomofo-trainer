import type { TimingContext } from "../core/model.js";
import type { MeasurementPolicy } from "./types.js";

export const PHASE_3_MEASUREMENT_POLICY: MeasurementPolicy = {
  version: "phase-3-v2",
  bindingContexts: ["syllable-start", "within-syllable", "tone"],
  confusionContexts: ["syllable-start", "within-syllable", "tone"],
  motorTimingContexts: ["within-syllable", "tone"],
  smoothingAlpha: 0.25,
};

export function includesContext(
  contexts: readonly TimingContext[],
  context: TimingContext,
): boolean {
  return contexts.includes(context);
}

export function validateMeasurementPolicy(policy: MeasurementPolicy): void {
  if (
    !Number.isFinite(policy.smoothingAlpha)
    || policy.smoothingAlpha <= 0
    || policy.smoothingAlpha > 1
  ) {
    throw new RangeError("smoothingAlpha must be greater than 0 and at most 1");
  }

  for (const context of policy.motorTimingContexts) {
    if (!policy.bindingContexts.includes(context)) {
      throw new Error(`motor timing context ${context} must also be a binding context`);
    }
  }
  for (const context of policy.confusionContexts) {
    if (!policy.bindingContexts.includes(context)) {
      throw new Error(`confusion context ${context} must also be a binding context`);
    }
  }
}

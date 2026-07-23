import { describe, expect, it } from "vitest";
import {
  DEFAULT_SELECTION_TUNING,
  parseSelectionTuning,
  policyForSelectionTuning,
} from "../../src/app/selection-tuning.js";
import { FREQUENCY_FIRST_UTTERANCE_POLICY } from "../../src/curriculum/frequency-first-utterance.js";

describe("selection tuning", () => {
  it("preserves the product policy at the default setting", () => {
    expect(policyForSelectionTuning(DEFAULT_SELECTION_TUNING))
      .toEqual(FREQUENCY_FIRST_UTTERANCE_POLICY);
  });

  it("scales error and timing influence independently", () => {
    const policy = policyForSelectionTuning({
      errorInfluence: 0,
      timingInfluence: 2,
    });
    expect(policy.errorBoostScale).toBe(0);
    expect(policy.timingBoostScale).toBe(0.7);
    expect(policy.transitionBoostScale).toBe(0.6);
    expect(policy.maximumCombinedLearnerBoost).toBe(1.5);
  });

  it("rejects malformed persisted settings", () => {
    expect(parseSelectionTuning("not json")).toBeNull();
    expect(parseSelectionTuning('{"errorInfluence":3,"timingInfluence":1}'))
      .toBeNull();
  });
});

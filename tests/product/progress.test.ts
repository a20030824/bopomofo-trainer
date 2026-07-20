import { describe, expect, it } from "vitest";
import { createCatalogSupportIndex } from "../../src/curriculum/support.js";
import { FREQUENCY_FIRST_UTTERANCE_POLICY } from "../../src/curriculum/frequency-first-utterance.js";
import { PHASE_3_MEASUREMENT_POLICY } from "../../src/measurement/policy.js";
import {
  createFreshProductProgress,
  parseProductProgress,
  serializeProductProgress,
} from "../../src/product/progress.js";
import { PRACTICE } from "./fixtures.js";

const support = createCatalogSupportIndex(PRACTICE);

function createProgress() {
  return createFreshProductProgress(
    support,
    "seed",
    "guided",
    "standard",
    PHASE_3_MEASUREMENT_POLICY,
    "phase-4-v1",
    FREQUENCY_FIRST_UTTERANCE_POLICY,
  );
}

function parse(source: string, layoutId = "standard") {
  return parseProductProgress(
    source,
    support,
    "guided",
    layoutId,
    PHASE_3_MEASUREMENT_POLICY,
    "phase-4-v1",
    FREQUENCY_FIRST_UTTERANCE_POLICY,
  );
}

describe("product progress codec", () => {
  it("round-trips a canonical guided layout-scoped profile with selection state", () => {
    const progress = createProgress();
    const parsed = parse(serializeProductProgress(progress));
    expect(parsed).toEqual(progress);
    expect(parsed!.selection).toMatchObject({
      policyVersion: "frequency-first-utterance-v1",
      stage: 1,
      stagePracticeRounds: 0,
    });
  });

  it("migrates legacy schema-v1 state without discarding measurements or rounds", () => {
    const progress = createProgress();
    const legacy = JSON.parse(serializeProductProgress(progress)) as Record<string, unknown>;
    legacy.schemaVersion = 1;
    delete legacy.selection;
    const parsed = parse(JSON.stringify(legacy));
    expect(parsed).not.toBeNull();
    expect(parsed).toMatchObject({
      schemaVersion: 2,
      seed: progress.seed,
      practiceRoundsCompleted: 0,
      evaluationRoundsCompleted: 0,
    });
    expect(parsed!.measurements).toEqual(progress.measurements);
    expect(parsed!.selection.stage).toBe(1);
  });

  it("rejects malformed, stale, and wrong-scope state", () => {
    const progress = createProgress();
    expect(parse("not-json")).toBeNull();
    expect(parse(serializeProductProgress(progress), "other-layout")).toBeNull();

    const stale = JSON.parse(serializeProductProgress(progress)) as Record<string, unknown>;
    stale.schemaVersion = 99;
    expect(parse(JSON.stringify(stale))).toBeNull();

    const stalePolicy = JSON.parse(serializeProductProgress(progress)) as Record<string, unknown>;
    stalePolicy.curriculumPolicyVersion = "phase-4-v0";
    expect(parse(JSON.stringify(stalePolicy))).toBeNull();

    const staleSelection = JSON.parse(serializeProductProgress(progress)) as {
      selection: Record<string, unknown>;
    };
    staleSelection.selection.policyVersion = "frequency-first-utterance-v0";
    expect(parse(JSON.stringify(staleSelection))).toBeNull();
  });
});

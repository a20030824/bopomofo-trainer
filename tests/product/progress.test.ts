import { describe, expect, it } from "vitest";
import { createCatalogSupportIndex } from "../../src/curriculum/support.js";
import { PHASE_3_MEASUREMENT_POLICY } from "../../src/measurement/policy.js";
import {
  createFreshProductProgress,
  parseProductProgress,
  serializeProductProgress,
} from "../../src/product/progress.js";
import { PRACTICE } from "./fixtures.js";

const support = createCatalogSupportIndex(PRACTICE);

describe("product progress codec", () => {
  it("round-trips a canonical guided layout-scoped profile", () => {
    const progress = createFreshProductProgress(
      support,
      "seed",
      "guided",
      "standard",
      PHASE_3_MEASUREMENT_POLICY,
      "phase-4-v1",
    );
    const parsed = parseProductProgress(
      serializeProductProgress(progress),
      support,
      "guided",
      "standard",
      PHASE_3_MEASUREMENT_POLICY,
      "phase-4-v1",
    );
    expect(parsed).toEqual(progress);
  });

  it("rejects malformed, stale, and wrong-scope state", () => {
    const progress = createFreshProductProgress(
      support,
      "seed",
      "guided",
      "standard",
      PHASE_3_MEASUREMENT_POLICY,
      "phase-4-v1",
    );
    expect(parseProductProgress(
      "not-json",
      support,
      "guided",
      "standard",
      PHASE_3_MEASUREMENT_POLICY,
      "phase-4-v1",
    )).toBeNull();
    expect(parseProductProgress(
      serializeProductProgress(progress),
      support,
      "guided",
      "other-layout",
      PHASE_3_MEASUREMENT_POLICY,
      "phase-4-v1",
    )).toBeNull();
    const stale = JSON.parse(serializeProductProgress(progress)) as Record<string, unknown>;
    stale.schemaVersion = 99;
    expect(parseProductProgress(
      JSON.stringify(stale),
      support,
      "guided",
      "standard",
      PHASE_3_MEASUREMENT_POLICY,
      "phase-4-v1",
    )).toBeNull();
    const stalePolicy = JSON.parse(serializeProductProgress(progress)) as Record<string, unknown>;
    stalePolicy.curriculumPolicyVersion = "phase-4-v0";
    expect(parseProductProgress(
      JSON.stringify(stalePolicy),
      support,
      "guided",
      "standard",
      PHASE_3_MEASUREMENT_POLICY,
      "phase-4-v1",
    )).toBeNull();
  });
});

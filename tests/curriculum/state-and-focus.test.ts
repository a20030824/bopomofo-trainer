import { describe, expect, it } from "vitest";
import { selectCurriculumFocus } from "../../src/curriculum/focus.js";
import {
  PHASE_4_CURRICULUM_POLICY,
  validateCurriculumPolicy,
} from "../../src/curriculum/policy.js";
import {
  createEmptyCurriculumProfile,
  profileFromAggregates,
} from "../../src/curriculum/simulator.js";
import { classifyBindingStates } from "../../src/curriculum/state.js";
import type { CurriculumBindingRecord } from "../../src/curriculum/types.js";
import { aggregate, eligibleProfile, support } from "./fixtures.js";

describe("catalog support and curriculum states", () => {
  it("separates binding support from motor-timing support", () => {
    expect(support.byToken["token:C"]).toMatchObject({
      entryCount: 1,
      bindingEntryCount: 1,
      motorEntryCount: 0,
    });
    expect(support.byToken["token:A"]).toMatchObject({
      bindingEntryCount: 7,
      motorEntryCount: 0,
    });
    expect(support.byToken["token:B"]).toMatchObject({
      bindingEntryCount: 4,
      motorEntryCount: 4,
    });
  });

  it("keeps unobserved separate from measured but unsupported", () => {
    const empty = createEmptyCurriculumProfile(
      support,
      "guided",
      "zhuyin-standard",
    );
    expect(
      classifyBindingStates(empty, support, PHASE_4_CURRICULUM_POLICY)
        .find((state) => state.tokenId === "token:C"),
    ).toMatchObject({
      state: "unobserved",
      reason: "no-binding-observations",
    });

    const measured = profileFromAggregates(
      support,
      "guided",
      "zhuyin-standard",
      [aggregate(empty, "token:C", null, 0.5)],
    );
    expect(
      classifyBindingStates(measured, support, PHASE_4_CURRICULUM_POLICY)
        .find((state) => state.tokenId === "token:C"),
    ).toMatchObject({
      state: "sampling",
      reason: "insufficient-binding-catalog-support",
    });
  });

  it("allows correctness-only initials and timed non-initials to become eligible", () => {
    const profile = eligibleProfile();
    expect(
      classifyBindingStates(profile, support, PHASE_4_CURRICULUM_POLICY)
        .find((state) => state.tokenId === "token:A"),
    ).toMatchObject({ state: "eligible", evidence: "correctness-only" });
    expect(
      classifyBindingStates(profile, support, PHASE_4_CURRICULUM_POLICY)
        .find((state) => state.tokenId === "token:B"),
    ).toMatchObject({ state: "eligible", evidence: "timed" });
  });

  it("validates policy thresholds", () => {
    expect(() => validateCurriculumPolicy({
      ...PHASE_4_CURRICULUM_POLICY,
      focusedEntryShare: 2,
    })).toThrow(RangeError);
    expect(() => validateCurriculumPolicy({
      ...PHASE_4_CURRICULUM_POLICY,
      errorWeight: 0,
    })).toThrow(RangeError);
  });
});

describe("focus selection", () => {
  it("starts a new learner in coverage without choosing a rare unsupported token", () => {
    const profile = createEmptyCurriculumProfile(
      support,
      "guided",
      "zhuyin-standard",
    );
    const focus = selectCurriculumFocus(
      profile,
      support,
      PHASE_4_CURRICULUM_POLICY,
    );
    expect(focus.phase).toBe("coverage");
    expect(focus.tokenId).not.toBe("token:C");
    expect(
      support.byToken[focus.tokenId!]?.bindingEntryCount,
    ).toBeGreaterThanOrEqual(3);
  });

  it("selects a clearly weak correctness-only common binding", () => {
    const focus = selectCurriculumFocus(
      eligibleProfile({ "token:A": { timingMs: null, errorRate: 0.4 } }),
      support,
      PHASE_4_CURRICULUM_POLICY,
    );
    expect(focus).toMatchObject({
      phase: "adaptive",
      tokenId: "token:A",
      evidence: "correctness-only",
    });
    expect(focus.candidates.find((candidate) => candidate.tokenId === "token:A"))
      .toMatchObject({ timingRatio: null });
  });

  it("uses timing for motor-eligible bindings", () => {
    const focus = selectCurriculumFocus(
      eligibleProfile({ "token:B": { timingMs: 460, errorRate: 0.3 } }),
      support,
      PHASE_4_CURRICULUM_POLICY,
    );
    expect(focus).toMatchObject({
      tokenId: "token:B",
      evidence: "timed",
    });
    expect(focus.candidates.find((candidate) => candidate.tokenId === "token:B")?.timingRatio)
      .not.toBeNull();
  });

  it("does not let unsupported rare bindings dominate", () => {
    const focus = selectCurriculumFocus(
      eligibleProfile({ "token:C": { timingMs: null, errorRate: 0.8 } }),
      support,
      PHASE_4_CURRICULUM_POLICY,
    );
    expect(focus.tokenId).not.toBe("token:C");
    expect(
      focus.candidates.some((candidate) => candidate.tokenId === "token:C"),
    ).toBe(false);
  });

  it("prevents immediate refocus during cooldown", () => {
    const base = eligibleProfile({
      "token:A": { timingMs: null, errorRate: 0.4 },
    });
    const current = base.bindings["token:A"]!;
    const bindings: Record<string, CurriculumBindingRecord> = {
      ...base.bindings,
      "token:A": { ...current, lastFocusedRound: 9 },
    };
    const profile = { ...base, round: 10, bindings };
    expect(
      selectCurriculumFocus(profile, support, PHASE_4_CURRICULUM_POLICY).tokenId,
    ).not.toBe("token:A");
    expect(
      classifyBindingStates(profile, support, PHASE_4_CURRICULUM_POLICY)
        .find((state) => state.tokenId === "token:A")?.state,
    ).toBe("cooldown");
  });
});

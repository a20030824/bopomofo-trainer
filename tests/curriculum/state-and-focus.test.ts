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
  it("counts support by unique entry", () => {
    expect(support.byToken["token:C"]).toMatchObject({
      entryCount: 1,
      entryIds: ["e5"],
    });
    expect(support.byToken["token:A"]?.entryCount).toBe(6);
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
      [aggregate(empty, "token:C", 700, 0.5)],
    );
    expect(
      classifyBindingStates(measured, support, PHASE_4_CURRICULUM_POLICY)
        .find((state) => state.tokenId === "token:C"),
    ).toMatchObject({
      state: "sampling",
      reason: "insufficient-catalog-support",
    });
  });

  it("validates policy thresholds", () => {
    expect(() => validateCurriculumPolicy({
      ...PHASE_4_CURRICULUM_POLICY,
      focusedEntryShare: 2,
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
    expect(support.byToken[focus.tokenId!]?.entryCount).toBeGreaterThanOrEqual(3);
  });

  it("selects a clearly weak eligible common binding", () => {
    const focus = selectCurriculumFocus(
      eligibleProfile({ "token:A": { timingMs: 460, errorRate: 0.4 } }),
      support,
      PHASE_4_CURRICULUM_POLICY,
    );
    expect(focus).toMatchObject({
      phase: "adaptive",
      tokenId: "token:A",
    });
  });

  it("does not let unsupported rare bindings dominate", () => {
    const focus = selectCurriculumFocus(
      eligibleProfile({ "token:C": { timingMs: 900, errorRate: 0.8 } }),
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
      "token:A": { timingMs: 460, errorRate: 0.4 },
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

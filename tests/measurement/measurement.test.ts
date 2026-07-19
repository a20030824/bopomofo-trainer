import { describe, expect, it } from "vitest";
import type { Exercise } from "../../src/core/model.js";
import {
  aggregateMeasurements,
  bindingScopeKey,
  smoothTiming,
} from "../../src/measurement/aggregate.js";
import { deriveMeasurementDecisions } from "../../src/measurement/derive-observations.js";
import {
  PHASE_3_MEASUREMENT_POLICY,
  validateMeasurementPolicy,
} from "../../src/measurement/policy.js";
import {
  applyInteractionInput,
  createInteractionSession,
  type InteractionInput,
  type InteractionSessionState,
} from "../../src/practice/interaction-session.js";

const exercise: Exercise = {
  id: "measurement-test",
  mode: "guided",
  layoutId: "zhuyin-standard",
  entries: [
    {
      id: "entry:a",
      prompt: { text: "甲乙", locale: "zh-TW" },
      syllables: [
        { tokens: ["zhuyin:A", "zhuyin:B", "tone:1"] },
        { tokens: ["zhuyin:C", "zhuyin:D", "tone:2"] },
      ],
      frequencyBand: 1,
      tags: ["test"],
      provenanceIds: ["test"],
    },
    {
      id: "entry:b",
      prompt: { text: "丙", locale: "zh-TW" },
      syllables: [{ tokens: ["zhuyin:E", "zhuyin:F", "tone:3"] }],
      frequencyBand: 1,
      tags: ["test"],
      provenanceIds: ["test"],
    },
  ],
};

function input(
  timestampMs: number,
  actualToken: string | null,
  overrides: Partial<InteractionInput> = {},
): InteractionInput {
  return {
    timestampMs,
    physicalCode: overrides.physicalCode ?? "Code",
    actualToken,
    repeat: overrides.repeat ?? false,
    composing: overrides.composing ?? false,
    modifierOnly: overrides.modifierOnly ?? false,
  };
}

function scriptedSession(): InteractionSessionState {
  let state = createInteractionSession(exercise, 0);
  state = applyInteractionInput(state, input(100, "zhuyin:A"));
  state = applyInteractionInput(state, input(180, "zhuyin:B"));
  state = applyInteractionInput(state, input(220, "zhuyin:X"));
  state = applyInteractionInput(state, input(300, "tone:1"));
  state = applyInteractionInput(state, input(500, "zhuyin:C"));
  state = applyInteractionInput(state, input(580, "zhuyin:D"));
  state = applyInteractionInput(state, input(600, "tone:2", { repeat: true }));
  state = applyInteractionInput(state, input(650, "tone:2"));
  state = applyInteractionInput(state, input(900, "zhuyin:E"));
  state = applyInteractionInput(state, input(920, null, {
    physicalCode: "Process",
    composing: true,
  }));
  state = applyInteractionInput(state, input(980, "zhuyin:F"));
  state = applyInteractionInput(state, input(1000, null, {
    physicalCode: "ArrowDown",
  }));
  state = applyInteractionInput(state, input(1060, "tone:3"));
  return state;
}

describe("measurement decisions", () => {
  it("makes boundary, recovery, noise, and motor timing decisions explicit", () => {
    const state = scriptedSession();
    const decisions = deriveMeasurementDecisions(
      exercise,
      state.traces,
      PHASE_3_MEASUREMENT_POLICY,
    );

    expect(decisions).toHaveLength(state.traces.length);
    expect(decisions[0]?.binding).toEqual({
      included: false,
      reason: "exercise-start",
    });
    expect(decisions[1]?.binding).toMatchObject({
      included: true,
      observation: { timingMs: 80, timingExclusionReason: null },
    });
    expect(decisions[2]?.confusion.included).toBe(true);
    expect(decisions[3]?.transition).toEqual({
      included: false,
      reason: "recovery",
    });
    expect(decisions[4]?.binding).toMatchObject({
      included: true,
      observation: {
        timingMs: null,
        timingExclusionReason: "syllable-start",
      },
    });
    expect(decisions[4]?.transition).toEqual({
      included: false,
      reason: "non-motor-context",
    });
    expect(decisions[8]?.binding).toEqual({
      included: false,
      reason: "entry-start",
    });
    expect(decisions[9]?.binding).toEqual({
      included: false,
      reason: "composition",
    });
    expect(decisions[11]?.binding).toEqual({
      included: false,
      reason: "unmapped",
    });
    expect(decisions[12]?.transition.included).toBe(true);
  });

  it("keeps unmapped interaction noise out of recovery state", () => {
    let state = createInteractionSession(exercise, 0);
    state = applyInteractionInput(state, input(100, "zhuyin:A"));
    state = applyInteractionInput(state, input(120, null, {
      physicalCode: "ArrowDown",
    }));

    expect(state.hadErrorSinceAdvance).toBe(false);
    state = applyInteractionInput(state, input(180, "zhuyin:B"));
    expect(state.traces.at(-1)?.recovery).toBe(false);
  });

  it("aggregates deterministic layout- and mode-scoped statistics", () => {
    const state = scriptedSession();
    const decisions = deriveMeasurementDecisions(
      exercise,
      state.traces,
      PHASE_3_MEASUREMENT_POLICY,
    );
    const summary = aggregateMeasurements(decisions, PHASE_3_MEASUREMENT_POLICY);

    expect(summary).toEqual(
      aggregateMeasurements(decisions, PHASE_3_MEASUREMENT_POLICY),
    );
    expect(summary).toMatchObject({
      policyVersion: "phase-3-v1",
      traceCount: 13,
      bindingObservationCount: 8,
      confusionObservationCount: 1,
      transitionObservationCount: 5,
    });

    const tone3Key = bindingScopeKey({
      mode: "guided",
      layoutId: "zhuyin-standard",
      tokenId: "tone:3",
    });
    expect(summary.bindings[tone3Key]).toMatchObject({
      attempts: 1,
      errors: 0,
      timingSamples: 1,
      currentTimeToTypeMs: 80,
      bestTimeToTypeMs: 80,
    });
  });

  it("does not merge identical tokens across practice modes or layouts", () => {
    const state = scriptedSession();
    const guided = deriveMeasurementDecisions(
      exercise,
      state.traces,
      PHASE_3_MEASUREMENT_POLICY,
    );
    const alternateExercise: Exercise = {
      ...exercise,
      id: "measurement-alternate",
      mode: "recall",
      layoutId: "alternate-layout",
    };
    const alternateTraces = state.traces.map((trace) => ({
      ...trace,
      exerciseId: alternateExercise.id,
    }));
    const alternate = deriveMeasurementDecisions(
      alternateExercise,
      alternateTraces,
      PHASE_3_MEASUREMENT_POLICY,
    );
    const summary = aggregateMeasurements(
      [...guided, ...alternate],
      PHASE_3_MEASUREMENT_POLICY,
    );

    const guidedTone = bindingScopeKey({
      mode: "guided",
      layoutId: "zhuyin-standard",
      tokenId: "tone:3",
    });
    const alternateTone = bindingScopeKey({
      mode: "recall",
      layoutId: "alternate-layout",
      tokenId: "tone:3",
    });
    expect(summary.bindings[guidedTone]?.attempts).toBe(1);
    expect(summary.bindings[alternateTone]?.attempts).toBe(1);
  });
});

describe("provisional smoothing", () => {
  it("uses a transparent configurable exponential moving average", () => {
    expect(smoothTiming(null, 100, 0.25)).toBe(100);
    expect(smoothTiming(100, 200, 0.25)).toBe(125);
    expect(() => smoothTiming(100, 200, 0)).toThrow(RangeError);
    expect(() => validateMeasurementPolicy({
      ...PHASE_3_MEASUREMENT_POLICY,
      smoothingAlpha: 2,
    })).toThrow(RangeError);
  });
});

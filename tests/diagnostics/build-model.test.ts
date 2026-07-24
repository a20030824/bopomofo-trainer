import { describe, expect, it } from "vitest";
import type { InputLayout } from "../../src/core/model.js";
import { PHASE_4_CURRICULUM_POLICY } from "../../src/curriculum/policy.js";
import type { CatalogSupportIndex, CurriculumProfile } from "../../src/curriculum/types.js";
import { buildDiagnosticModel } from "../../src/diagnostics/build-model.js";
import {
  bindingScopeKey,
  confusionScopeKey,
  transitionScopeKey,
} from "../../src/measurement/aggregate.js";
import type {
  BindingAggregate,
  ConfusionAggregate,
  MeasurementSummary,
  TransitionAggregate,
} from "../../src/measurement/types.js";

const layout: InputLayout = {
  id: "test-layout",
  name: "Test",
  bindings: {
    KeyA: "zhuyin:A",
    KeyB: "zhuyin:B",
    KeyC: "zhuyin:C",
  },
};

const timedAggregate: BindingAggregate = {
  scope: { mode: "guided", layoutId: layout.id, tokenId: "zhuyin:A" },
  attempts: 10,
  errors: 2,
  timingSamples: 6,
  currentTimeToTypeMs: 480,
  bestTimeToTypeMs: 320,
  timingExclusions: {
    syllableStart: 2,
    incorrect: 2,
    recovery: 1,
    interactionNoise: 1,
  },
};

const correctnessOnlyAggregate: BindingAggregate = {
  scope: { mode: "guided", layoutId: layout.id, tokenId: "zhuyin:B" },
  attempts: 8,
  errors: 1,
  timingSamples: 0,
  currentTimeToTypeMs: null,
  bestTimeToTypeMs: null,
  timingExclusions: {
    syllableStart: 7,
    incorrect: 1,
    recovery: 0,
    interactionNoise: 0,
  },
};

const transition: TransitionAggregate = {
  scope: {
    mode: "guided",
    layoutId: layout.id,
    fromToken: "zhuyin:A",
    toToken: "zhuyin:B",
  },
  timingSamples: 5,
  currentTimeToTypeMs: 500,
  bestTimeToTypeMs: 350,
};

const confusionAB: ConfusionAggregate = {
  scope: {
    mode: "guided",
    layoutId: layout.id,
    expectedToken: "zhuyin:A",
    actualToken: "zhuyin:B",
  },
  occurrences: 4,
};

const confusionAC: ConfusionAggregate = {
  scope: {
    mode: "guided",
    layoutId: layout.id,
    expectedToken: "zhuyin:A",
    actualToken: "zhuyin:C",
  },
  occurrences: 2,
};

const measurements: MeasurementSummary = {
  policyVersion: "phase-3-v2",
  traceCount: 20,
  bindingObservationCount: 18,
  confusionObservationCount: 6,
  transitionObservationCount: 5,
  bindings: {
    [bindingScopeKey(timedAggregate.scope)]: timedAggregate,
    [bindingScopeKey(correctnessOnlyAggregate.scope)]: correctnessOnlyAggregate,
  },
  confusions: {
    [confusionScopeKey(confusionAB.scope)]: confusionAB,
    [confusionScopeKey(confusionAC.scope)]: confusionAC,
  },
  transitions: {
    [transitionScopeKey(transition.scope)]: transition,
  },
};

const support: CatalogSupportIndex = {
  byToken: {
    "zhuyin:A": {
      tokenId: "zhuyin:A",
      entryIds: ["a", "b", "c"],
      entryCount: 3,
      bindingEntryIds: ["a", "b", "c"],
      bindingEntryCount: 3,
      motorEntryIds: ["a", "b", "c"],
      motorEntryCount: 3,
      commonEntryCount: 3,
      commonBindingEntryCount: 3,
      commonMotorEntryCount: 3,
      frequencyBandCounts: { 1: 3, 2: 0, 3: 0 },
    },
    "zhuyin:B": {
      tokenId: "zhuyin:B",
      entryIds: ["a", "b", "c"],
      entryCount: 3,
      bindingEntryIds: ["a", "b", "c"],
      bindingEntryCount: 3,
      motorEntryIds: [],
      motorEntryCount: 0,
      commonEntryCount: 3,
      commonBindingEntryCount: 3,
      commonMotorEntryCount: 0,
      frequencyBandCounts: { 1: 3, 2: 0, 3: 0 },
    },
    "zhuyin:C": {
      tokenId: "zhuyin:C",
      entryIds: ["a", "b", "c"],
      entryCount: 3,
      bindingEntryIds: ["a", "b", "c"],
      bindingEntryCount: 3,
      motorEntryIds: ["a", "b", "c"],
      motorEntryCount: 3,
      commonEntryCount: 3,
      commonBindingEntryCount: 3,
      commonMotorEntryCount: 3,
      frequencyBandCounts: { 1: 3, 2: 0, 3: 0 },
    },
  },
  entriesById: {},
};

const curriculum: CurriculumProfile = {
  mode: "guided",
  layoutId: layout.id,
  round: 8,
  bindings: {
    "zhuyin:A": { scope: timedAggregate.scope, aggregate: timedAggregate, lastFocusedRound: null },
    "zhuyin:B": {
      scope: correctnessOnlyAggregate.scope,
      aggregate: correctnessOnlyAggregate,
      lastFocusedRound: 7,
    },
    "zhuyin:C": {
      scope: { mode: "guided", layoutId: layout.id, tokenId: "zhuyin:C" },
      aggregate: null,
      lastFocusedRound: null,
    },
  },
  recentEntryIds: [],
  recentTokenIds: [],
};

describe("diagnostic model", () => {
  it("keeps error, timing, transition, and confusion semantics separate", () => {
    const model = buildDiagnosticModel({
      measurements,
      curriculum,
      curriculumPolicy: PHASE_4_CURRICULUM_POLICY,
      support,
      layout,
      focusedTokenId: "zhuyin:A",
    });

    const keyA = model.keys.find((row) => row.tokenId === "zhuyin:A");
    expect(keyA).toMatchObject({
      physicalKey: "A",
      attempts: 10,
      errors: 2,
      displayedErrorRatio: 0.2,
      errorDataState: "sufficient",
      timingAvailability: "available",
      timingDataState: "sufficient",
      overallDataState: "sufficient",
      reinforcement: { state: "focused", label: "加強中" },
    });
    expect(keyA?.excludedSamples).toEqual(timedAggregate.timingExclusions);

    const keyB = model.keys.find((row) => row.tokenId === "zhuyin:B");
    expect(keyB).toMatchObject({
      timingAvailability: "not-applicable",
      timingDataState: null,
      overallDataState: "sufficient",
      reinforcement: { state: "cooldown", label: "最近已加強" },
    });

    expect(model.transitions).toEqual([
      expect.objectContaining({
        id: "transition:zhuyin:A->zhuyin:B",
        timingSamples: 5,
        timingMs: 500,
        dataState: "sufficient",
      }),
    ]);
    expect(model.confusions.find((row) => row.actualTokenId === "zhuyin:B")).toMatchObject({
      occurrences: 4,
      expectedConfusionTotal: 6,
      expectedErrorShare: 4 / 6,
    });
    expect(model.summary).toEqual({
      keysWithData: 2,
      repeatedConfusions: 2,
      slowerTransitions: 1,
    });
  });
});

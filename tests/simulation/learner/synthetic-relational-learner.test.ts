import { describe, expect, it } from "vitest";
import type { CatalogEntry, Exercise, TokenId } from "../../../src/core/model.js";
import { PHASE_3_MEASUREMENT_POLICY } from "../../../src/measurement/policy.js";
import { confusionTruthKey, transitionTruthKey } from "../../../src/simulation/learner/state.js";
import {
  createSyntheticScenarios,
  getSyntheticScenario,
  SYNTHETIC_EXERCISE,
  SYNTHETIC_LAYOUT,
} from "../../../src/simulation/learner/scenarios.js";
import type {
  BindingTruth,
  SyntheticLearnerState,
  TransitionTruth,
} from "../../../src/simulation/learner/types.js";
import { generateSyntheticTraceBatch } from "../../../src/simulation/trace-generator/generate.js";

function entry(id: string, syllables: readonly (readonly TokenId[])[]): CatalogEntry {
  return {
    id,
    prompt: { text: id, locale: "zh-TW" },
    syllables: syllables.map((tokens) => ({ tokens })),
    frequencyBand: 1,
    tags: ["synthetic-test"],
    provenanceIds: ["synthetic-test"],
  };
}

function exercise(id: string, entries: readonly CatalogEntry[]): Exercise {
  return {
    id,
    mode: "guided",
    layoutId: SYNTHETIC_LAYOUT.id,
    entries,
  };
}

function mapBindings(
  learner: SyntheticLearnerState,
  mapper: (binding: BindingTruth) => BindingTruth,
): SyntheticLearnerState {
  return {
    ...learner,
    bindings: Object.fromEntries(
      Object.entries(learner.bindings).map(([key, binding]) => [key, mapper(binding)]),
    ),
  };
}

function mapTransitions(
  learner: SyntheticLearnerState,
  mapper: (transition: TransitionTruth) => TransitionTruth,
): SyntheticLearnerState {
  return {
    ...learner,
    transitions: Object.fromEntries(
      Object.entries(learner.transitions).map(([key, transition]) => [key, mapper(transition)]),
    ),
  };
}

function deterministicLearner(): SyntheticLearnerState {
  let learner = getSyntheticScenario("zero-learning").learner;
  learner = mapBindings(learner, (binding) => ({
    ...binding,
    errorProbability: 0,
    learningRate: 0,
    decayRatePerStep: 0,
    boundaryResponseAdjustmentMs: 0,
  }));
  learner = mapTransitions(learner, (transition) => ({
    ...transition,
    latency: { meanMs: 90, standardDeviationMs: 0 },
    learningRate: 0,
    decayRatePerStep: 0,
    transfer: [],
  }));
  return {
    ...learner,
    confusions: {},
    context: {
      exerciseStartLatency: { meanMs: 100, standardDeviationMs: 0 },
      entryStartLatency: { meanMs: 110, standardDeviationMs: 0 },
      syllableStartLatency: { meanMs: 120, standardDeviationMs: 0 },
      defaultTransitionLatency: { meanMs: 90, standardDeviationMs: 0 },
      recoveryDelay: { meanMs: 50, standardDeviationMs: 0 },
      unmappedNoiseProbability: 0,
      heldRepeatProbability: 0,
      compositionInterruptionProbability: 0,
      sessionLatencyScaleStandardDeviation: 0,
      observationLatencyScaleStandardDeviation: 0,
    },
  };
}

function generate(
  learner: SyntheticLearnerState,
  semanticExercise: Exercise,
  seed = 7,
  retentionSteps = 0,
) {
  return generateSyntheticTraceBatch(
    semanticExercise,
    SYNTHETIC_LAYOUT,
    PHASE_3_MEASUREMENT_POLICY,
    learner,
    { scenarioId: "test", seed, startedAtMs: 0, retentionSteps },
  );
}

describe("synthetic relational learner", () => {
  it("produces fully predictable traces when error, noise, and variance are zero", () => {
    const semanticExercise = exercise("predictable", [
      entry("predictable-entry", [
        ["ㄓ", "ㄨ", "ㄥ", "tone:1"],
        ["ㄅ", "ㄆ", "tone:1"],
      ]),
    ]);
    const batch = generate(deterministicLearner(), semanticExercise);

    expect(batch.traces.map((trace) => trace.timestampMs)).toEqual([
      100, 190, 280, 370, 490, 580, 670,
    ]);
    expect(batch.traces.every((trace) => trace.outcome === "correct")).toBe(true);
    expect(batch.generationDecisions.map((decision) => decision.timingReason)).toEqual([
      "exercise-boundary-truth",
      "directional-transition-truth",
      "directional-transition-truth",
      "directional-transition-truth",
      "syllable-boundary-truth",
      "directional-transition-truth",
      "directional-transition-truth",
    ]);
    expect(batch.stopReason).toBe("sequence-complete");
  });

  it("attributes an isolated slow ㄓ to ㄨ edge only to the transition estimate", () => {
    let learner = deterministicLearner();
    const key = transitionTruthKey("ㄓ", "ㄨ");
    const current = learner.transitions[key];
    expect(current).toBeDefined();
    learner = {
      ...learner,
      transitions: {
        ...learner.transitions,
        [key]: {
          ...current!,
          latency: { meanMs: 500, standardDeviationMs: 0 },
        },
      },
    };
    const semanticExercise = exercise("weak-edge", [
      entry("weak-edge-entry", Array.from({ length: 12 }, () => [
        "ㄓ", "ㄨ", "ㄥ", "tone:1",
      ])),
    ]);
    const batch = generate(learner, semanticExercise);
    const slowTransitions = Object.values(batch.measurementEstimate.transitionMeanLatencies)
      .filter((estimate) => estimate.value > 200)
      .map((estimate) => estimate.relationKey);

    expect(slowTransitions).toEqual([key]);
    expect(batch.measurementEstimate.transitionMeanLatencies[key]?.value).toBe(500);
    expect(Object.values(batch.measurementEstimate.bindingErrorRates)
      .every((estimate) => estimate.value === 0)).toBe(true);
  });

  it("keeps ㄅ to ㄆ confusion directional and does not invent the reverse edge", () => {
    let learner = deterministicLearner();
    learner = {
      ...learner,
      bindings: {
        ...learner.bindings,
        "ㄅ": {
          ...learner.bindings["ㄅ"]!,
          errorProbability: 1,
          fallbackActualToken: "ㄓ",
        },
      },
      confusions: {
        [confusionTruthKey("ㄅ", "ㄆ")]: {
          expectedToken: "ㄅ",
          actualToken: "ㄆ",
          conditionalProbability: 1,
          learningRate: 0,
          decayRatePerStep: 0,
        },
      },
    };
    const semanticExercise = exercise("directional-confusion", [
      entry("directional-entry", Array.from({ length: 10 }, () => [
        ["ㄓ", "ㄅ", "tone:1"],
        ["ㄓ", "ㄆ", "tone:1"],
      ]).flat()),
    ]);
    const batch = generate(learner, semanticExercise);

    expect(batch.measurementEstimate.conditionalConfusionRates[
      confusionTruthKey("ㄅ", "ㄆ")
    ]?.value).toBe(1);
    expect(batch.measurementEstimate.conditionalConfusionRates[
      confusionTruthKey("ㄆ", "ㄅ")
    ]).toBeUndefined();
  });

  it("excludes recovery timing from clean transition evidence", () => {
    let learner = deterministicLearner();
    learner = {
      ...learner,
      bindings: {
        ...learner.bindings,
        "ㄨ": {
          ...learner.bindings["ㄨ"]!,
          errorProbability: 1,
          fallbackActualToken: "ㄅ",
        },
      },
    };
    const batch = generate(
      learner,
      exercise("recovery", [entry("recovery-entry", [["ㄓ", "ㄨ", "tone:1"]])]),
    );
    const recoveryTrace = batch.traces.find((trace) => trace.recovery);
    expect(recoveryTrace).toBeDefined();
    const decision = batch.measurementEstimate.decisions.find(
      (candidate) => candidate.traceSequence === recoveryTrace?.sequence,
    );
    expect(decision?.transition).toEqual({ included: false, reason: "recovery" });
    expect(batch.measurementEstimate.transitionMeanLatencies[
      transitionTruthKey("ㄓ", "ㄨ")
    ]).toBeUndefined();
  });

  it("never creates a transition across a syllable boundary", () => {
    const batch = generate(
      deterministicLearner(),
      exercise("boundaries", [
        entry("boundary-entry", [
          ["ㄓ", "ㄨ"],
          ["ㄅ", "ㄆ"],
        ]),
      ]),
    );
    expect(Object.keys(batch.measurementEstimate.transitionMeanLatencies)).toEqual([
      transitionTruthKey("ㄅ", "ㄆ"),
      transitionTruthKey("ㄓ", "ㄨ"),
    ].sort());
    expect(batch.measurementEstimate.transitionMeanLatencies[
      transitionTruthKey("ㄨ", "ㄅ")
    ]).toBeUndefined();
  });

  it("replays every required scenario exactly for the same seed", () => {
    const scenarios = createSyntheticScenarios();
    expect(scenarios.map((scenario) => scenario.id)).toEqual([
      "weak-binding",
      "weak-transition",
      "asymmetric-confusion",
      "competing-weaknesses",
      "high-noise",
      "fast-inaccurate",
      "slow-accurate",
      "zero-learning",
      "retention-decay",
    ]);
    for (const scenario of scenarios) {
      const first = generateSyntheticTraceBatch(
        scenario.exercise,
        scenario.layout,
        scenario.measurementPolicy,
        scenario.learner,
        {
          scenarioId: scenario.id,
          seed: scenario.seed,
          startedAtMs: scenario.startedAtMs,
          retentionSteps: scenario.retentionSteps,
        },
      );
      const second = generateSyntheticTraceBatch(
        scenario.exercise,
        scenario.layout,
        scenario.measurementPolicy,
        scenario.learner,
        {
          scenarioId: scenario.id,
          seed: scenario.seed,
          startedAtMs: scenario.startedAtMs,
          retentionSteps: scenario.retentionSteps,
        },
      );
      expect(second.traces).toEqual(first.traces);
      expect(second.measurementEstimate.aggregate).toEqual(first.measurementEstimate.aggregate);
      expect(second.determinismDigest).toEqual(first.determinismDigest);
    }
  });

  it("keeps zero-learning relation truth unchanged while still recording exposure", () => {
    const scenario = getSyntheticScenario("zero-learning");
    const batch = generateSyntheticTraceBatch(
      scenario.exercise,
      scenario.layout,
      scenario.measurementPolicy,
      scenario.learner,
      {
        scenarioId: scenario.id,
        seed: scenario.seed,
        startedAtMs: scenario.startedAtMs,
      },
    );
    expect(batch.afterTruth.state.bindings).toEqual(batch.beforeTruth.state.bindings);
    expect(batch.afterTruth.state.transitions).toEqual(batch.beforeTruth.state.transitions);
    expect(batch.exposureUpdate.events.length).toBeGreaterThan(0);
    expect(batch.exposureUpdate.events.every((event) => event.before === event.after)).toBe(true);
  });

  it("records learning and subsequent retention decay as separate reasons", () => {
    const scenario = getSyntheticScenario("retention-decay");
    const batch = generateSyntheticTraceBatch(
      scenario.exercise,
      scenario.layout,
      scenario.measurementPolicy,
      scenario.learner,
      {
        scenarioId: scenario.id,
        seed: scenario.seed,
        startedAtMs: scenario.startedAtMs,
        retentionSteps: scenario.retentionSteps,
      },
    );
    const bindingEvents = batch.exposureUpdate.events.filter(
      (event) => event.relationKind === "binding" && event.relationKey === "ㄨ",
    );
    expect(bindingEvents.some((event) => event.reason === "semantic-binding-exposure")).toBe(true);
    expect(bindingEvents.some((event) => event.reason === "binding-retention-decay")).toBe(true);
    expect(batch.exposureUpdate.retentionSteps).toBe(4);
  });

  it("converges toward latent binding, confusion, and transition truth without exact random snapshots", () => {
    let learner = deterministicLearner();
    const transitionKey = transitionTruthKey("ㄓ", "ㄨ");
    learner = {
      ...learner,
      bindings: {
        ...learner.bindings,
        "ㄨ": {
          ...learner.bindings["ㄨ"]!,
          errorProbability: 0.2,
          fallbackActualToken: "ㄆ",
        },
      },
      transitions: {
        ...learner.transitions,
        [transitionKey]: {
          ...learner.transitions[transitionKey]!,
          latency: { meanMs: 200, standardDeviationMs: 40 },
        },
      },
      confusions: {
        [confusionTruthKey("ㄨ", "ㄅ")]: {
          expectedToken: "ㄨ",
          actualToken: "ㄅ",
          conditionalProbability: 0.7,
          learningRate: 0,
          decayRatePerStep: 0,
        },
      },
    };
    const entries = Array.from({ length: 2500 }, (_, index) =>
      entry(`mc-${index}`, [["ㄓ", "ㄨ", "tone:1"]])
    );
    const batch = generate(learner, exercise("monte-carlo", entries), 483920);

    expect(batch.measurementEstimate.bindingErrorRates["ㄨ"]?.value).toBeCloseTo(0.2, 1);
    expect(batch.measurementEstimate.conditionalConfusionRates[
      confusionTruthKey("ㄨ", "ㄅ")
    ]?.value).toBeCloseTo(0.7, 1);
    expect(batch.measurementEstimate.transitionMeanLatencies[transitionKey]?.value)
      .toBeGreaterThan(192);
    expect(batch.measurementEstimate.transitionMeanLatencies[transitionKey]?.value)
      .toBeLessThan(208);

    const report = Object.fromEntries(
      batch.estimationErrorReport.components.map((component) => [component.relationKey, component]),
    );
    expect(report["ㄨ"]?.absoluteError).toBeLessThan(0.03);
    expect(report[transitionKey]?.relativeError).toBeLessThan(0.04);
    expect(report[confusionTruthKey("ㄨ", "ㄅ")]?.absoluteError).toBeLessThan(0.05);
  });
});

void SYNTHETIC_EXERCISE;

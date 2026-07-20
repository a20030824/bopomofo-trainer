import type { CatalogEntry, Exercise, InputLayout, TokenId } from "../../core/model.js";
import { PHASE_3_MEASUREMENT_POLICY } from "../../measurement/policy.js";
import { confusionTruthKey, transitionTruthKey } from "./state.js";
import type {
  BindingTruth,
  ConfusionTruth,
  ContextNoiseTruth,
  SyntheticLearnerState,
  SyntheticScenario,
  TransitionTruth,
} from "./types.js";

const TOKENS = ["ㄅ", "ㄆ", "ㄇ", "ㄓ", "ㄨ", "ㄥ", "tone:1"] as const;

export const SYNTHETIC_LAYOUT: InputLayout = {
  id: "synthetic-taiwan-standard",
  name: "Synthetic Taiwan Standard subset",
  bindings: {
    KeyB: "ㄅ",
    KeyP: "ㄆ",
    KeyM: "ㄇ",
    KeyZ: "ㄓ",
    KeyU: "ㄨ",
    KeyG: "ㄥ",
    Space: "tone:1",
  },
};

function entry(id: string, syllables: readonly (readonly TokenId[])[]): CatalogEntry {
  return {
    id,
    prompt: { text: id, locale: "zh-TW" },
    syllables: syllables.map((tokens) => ({ tokens })),
    frequencyBand: 1,
    tags: ["synthetic"],
    provenanceIds: ["synthetic-fixture"],
  };
}

export const SYNTHETIC_EXERCISE: Exercise = {
  id: "synthetic-relational-sequence-v1",
  mode: "guided",
  layoutId: SYNTHETIC_LAYOUT.id,
  entries: [
    entry("synthetic-a", [
      ["ㄓ", "ㄨ", "ㄥ", "tone:1"],
      ["ㄓ", "ㄅ", "tone:1"],
      ["ㄓ", "ㄆ", "tone:1"],
      ["ㄅ", "ㄆ", "tone:1"],
      ["ㄆ", "ㄅ", "tone:1"],
    ]),
  ],
};

function binding(tokenId: TokenId, fallbackActualToken: TokenId): BindingTruth {
  return {
    tokenId,
    errorProbability: 0.02,
    fallbackActualToken,
    boundaryResponseAdjustmentMs: 0,
    learningRate: 0.04,
    decayRatePerStep: 0,
  };
}

function transition(
  fromToken: TokenId,
  toToken: TokenId,
  meanMs = 110,
  standardDeviationMs = 12,
): TransitionTruth {
  return {
    fromToken,
    toToken,
    latency: { meanMs, standardDeviationMs },
    learningRate: 0.03,
    decayRatePerStep: 0,
    transfer: [],
  };
}

function baseContext(): ContextNoiseTruth {
  return {
    exerciseStartLatency: { meanMs: 360, standardDeviationMs: 35 },
    entryStartLatency: { meanMs: 300, standardDeviationMs: 30 },
    syllableStartLatency: { meanMs: 220, standardDeviationMs: 22 },
    defaultTransitionLatency: { meanMs: 110, standardDeviationMs: 12 },
    recoveryDelay: { meanMs: 180, standardDeviationMs: 20 },
    unmappedNoiseProbability: 0,
    heldRepeatProbability: 0,
    compositionInterruptionProbability: 0,
    sessionLatencyScaleStandardDeviation: 0.02,
    observationLatencyScaleStandardDeviation: 0.03,
  };
}

function baseLearner(): SyntheticLearnerState {
  const bindings: Record<string, BindingTruth> = {
    "ㄅ": binding("ㄅ", "ㄓ"),
    "ㄆ": binding("ㄆ", "ㄇ"),
    "ㄇ": binding("ㄇ", "ㄓ"),
    "ㄓ": binding("ㄓ", "ㄇ"),
    "ㄨ": binding("ㄨ", "ㄅ"),
    "ㄥ": binding("ㄥ", "ㄇ"),
    "tone:1": binding("tone:1", "ㄇ"),
  };
  const pairs: readonly (readonly [TokenId, TokenId])[] = [
    ["ㄓ", "ㄨ"],
    ["ㄨ", "ㄥ"],
    ["ㄥ", "tone:1"],
    ["ㄓ", "ㄅ"],
    ["ㄅ", "tone:1"],
    ["ㄓ", "ㄆ"],
    ["ㄆ", "tone:1"],
    ["ㄅ", "ㄆ"],
    ["ㄆ", "ㄅ"],
  ];
  const transitions = Object.fromEntries(
    pairs.map(([fromToken, toToken]) => [
      transitionTruthKey(fromToken, toToken),
      transition(fromToken, toToken),
    ]),
  );
  return {
    version: "synthetic-relational-v1",
    sessionIndex: 0,
    bindings,
    transitions,
    confusions: {},
    context: baseContext(),
  };
}

function replaceBinding(
  learner: SyntheticLearnerState,
  tokenId: TokenId,
  patch: Partial<BindingTruth>,
): SyntheticLearnerState {
  const current = learner.bindings[tokenId];
  if (current === undefined) throw new Error(`unknown binding ${tokenId}`);
  return {
    ...learner,
    bindings: { ...learner.bindings, [tokenId]: { ...current, ...patch } },
  };
}

function replaceTransition(
  learner: SyntheticLearnerState,
  fromToken: TokenId,
  toToken: TokenId,
  patch: Partial<TransitionTruth>,
): SyntheticLearnerState {
  const key = transitionTruthKey(fromToken, toToken);
  const current = learner.transitions[key];
  if (current === undefined) throw new Error(`unknown transition ${key}`);
  return {
    ...learner,
    transitions: { ...learner.transitions, [key]: { ...current, ...patch } },
  };
}

function addConfusion(
  learner: SyntheticLearnerState,
  confusion: ConfusionTruth,
): SyntheticLearnerState {
  const key = confusionTruthKey(confusion.expectedToken, confusion.actualToken);
  return { ...learner, confusions: { ...learner.confusions, [key]: confusion } };
}

function mapBindings(
  learner: SyntheticLearnerState,
  mapper: (truth: BindingTruth) => BindingTruth,
): SyntheticLearnerState {
  return {
    ...learner,
    bindings: Object.fromEntries(
      Object.entries(learner.bindings).map(([key, truth]) => [key, mapper(truth)]),
    ),
  };
}

function mapTransitions(
  learner: SyntheticLearnerState,
  mapper: (truth: TransitionTruth) => TransitionTruth,
): SyntheticLearnerState {
  return {
    ...learner,
    transitions: Object.fromEntries(
      Object.entries(learner.transitions).map(([key, truth]) => [key, mapper(truth)]),
    ),
  };
}

function scenario(
  id: SyntheticScenario["id"],
  description: string,
  seed: number,
  learner: SyntheticLearnerState,
  retentionSteps = 0,
): SyntheticScenario {
  return {
    id,
    description,
    seed,
    startedAtMs: 1000,
    retentionSteps,
    exercise: SYNTHETIC_EXERCISE,
    layout: SYNTHETIC_LAYOUT,
    measurementPolicy: PHASE_3_MEASUREMENT_POLICY,
    learner,
  };
}

export function createSyntheticScenarios(): readonly SyntheticScenario[] {
  const weakBinding = replaceBinding(baseLearner(), "ㄨ", {
    errorProbability: 0.48,
    learningRate: 0.08,
  });

  const weakTransition = replaceTransition(baseLearner(), "ㄓ", "ㄨ", {
    latency: { meanMs: 520, standardDeviationMs: 35 },
    learningRate: 0.06,
  });

  let asymmetricConfusion = replaceBinding(baseLearner(), "ㄅ", {
    errorProbability: 0.42,
    fallbackActualToken: "ㄓ",
  });
  asymmetricConfusion = addConfusion(asymmetricConfusion, {
    expectedToken: "ㄅ",
    actualToken: "ㄆ",
    conditionalProbability: 0.88,
    learningRate: 0.05,
    decayRatePerStep: 0,
  });

  let competing = replaceBinding(baseLearner(), "ㄨ", { errorProbability: 0.28 });
  competing = replaceBinding(competing, "ㄅ", {
    errorProbability: 0.34,
    fallbackActualToken: "ㄓ",
  });
  competing = replaceTransition(competing, "ㄓ", "ㄨ", {
    latency: { meanMs: 430, standardDeviationMs: 30 },
  });
  competing = addConfusion(competing, {
    expectedToken: "ㄅ",
    actualToken: "ㄆ",
    conditionalProbability: 0.62,
    learningRate: 0.04,
    decayRatePerStep: 0,
  });

  const highNoiseBase = baseLearner();
  const highNoise: SyntheticLearnerState = {
    ...highNoiseBase,
    context: {
      ...highNoiseBase.context,
      unmappedNoiseProbability: 0.18,
      heldRepeatProbability: 0.14,
      compositionInterruptionProbability: 0.16,
      sessionLatencyScaleStandardDeviation: 0.12,
      observationLatencyScaleStandardDeviation: 0.18,
    },
  };

  let fastInaccurate = mapBindings(baseLearner(), (truth) => ({
    ...truth,
    errorProbability: truth.tokenId === "tone:1" ? 0.18 : 0.3,
  }));
  fastInaccurate = mapTransitions(fastInaccurate, (truth) => ({
    ...truth,
    latency: { meanMs: 65, standardDeviationMs: 8 },
  }));
  fastInaccurate = {
    ...fastInaccurate,
    context: {
      ...fastInaccurate.context,
      defaultTransitionLatency: { meanMs: 65, standardDeviationMs: 8 },
    },
  };

  let slowAccurate = mapBindings(baseLearner(), (truth) => ({
    ...truth,
    errorProbability: 0.005,
  }));
  slowAccurate = mapTransitions(slowAccurate, (truth) => ({
    ...truth,
    latency: { meanMs: 430, standardDeviationMs: 28 },
  }));
  slowAccurate = {
    ...slowAccurate,
    context: {
      ...slowAccurate.context,
      defaultTransitionLatency: { meanMs: 430, standardDeviationMs: 28 },
    },
  };

  let zeroLearning = mapBindings(baseLearner(), (truth) => ({
    ...truth,
    errorProbability: truth.tokenId === "ㄨ" ? 0.35 : truth.errorProbability,
    learningRate: 0,
  }));
  zeroLearning = mapTransitions(zeroLearning, (truth) => ({
    ...truth,
    learningRate: 0,
  }));

  let retention = replaceBinding(baseLearner(), "ㄨ", {
    errorProbability: 0.18,
    learningRate: 0.18,
    decayRatePerStep: 0.12,
  });
  retention = replaceTransition(retention, "ㄓ", "ㄨ", {
    latency: { meanMs: 300, standardDeviationMs: 25 },
    learningRate: 0.1,
    decayRatePerStep: 0.1,
  });

  return [
    scenario("weak-binding", "One weak binding with otherwise normal transitions.", 1101, weakBinding),
    scenario("weak-transition", "One slow directional transition with normal component bindings.", 1102, weakTransition),
    scenario("asymmetric-confusion", "Directional ㄅ to ㄆ confusion without reverse symmetry.", 1103, asymmetricConfusion),
    scenario("competing-weaknesses", "Binding, transition, and confusion weaknesses compete.", 1104, competing),
    scenario("high-noise", "Interaction noise and latency variance are elevated.", 1105, highNoise),
    scenario("fast-inaccurate", "Low transition latency with elevated binding errors.", 1106, fastInaccurate),
    scenario("slow-accurate", "High transition latency with nearly perfect binding correctness.", 1107, slowAccurate),
    scenario("zero-learning", "Exposure produces no latent skill improvement.", 1108, zeroLearning),
    scenario("retention-decay", "Exposure improvement is followed by declared retention decay.", 1109, retention, 4),
  ];
}

export function getSyntheticScenario(id: SyntheticScenario["id"]): SyntheticScenario {
  const found = createSyntheticScenarios().find((candidate) => candidate.id === id);
  if (found === undefined) throw new Error(`unknown synthetic scenario ${id}`);
  return found;
}

export const SYNTHETIC_SCENARIO_IDS = createSyntheticScenarios().map((candidate) => candidate.id);
void TOKENS;

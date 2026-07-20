import type {
  CatalogEntry,
  PracticeMode,
  RandomSource,
  TokenId,
} from "../core/model.js";
import {
  bindingScopeKey,
  transitionScopeKey,
} from "../measurement/aggregate.js";
import type { MeasurementSummary } from "../measurement/types.js";
import { composeGrammarCandidates } from "../grammar/compose.js";
import type {
  GrammarAnnotation,
  GrammarUtteranceCandidate,
} from "../grammar/types.js";
import { weightedPick } from "./random.js";

export type FrequencyStage = 1 | 2 | 3;

export interface FrequencyFirstUtterancePolicy {
  readonly version: string;
  readonly frequencyBandWeights: Readonly<Record<FrequencyStage, number>>;
  readonly minimumBindingAttempts: number;
  readonly minimumBindingTimingSamples: number;
  readonly minimumTransitionTimingSamples: number;
  readonly maximumExpectedTokenBoost: number;
  readonly maximumTransitionBoost: number;
  readonly maximumCombinedLearnerBoost: number;
  readonly errorBoostScale: number;
  readonly timingBoostScale: number;
  readonly transitionBoostScale: number;
  readonly recentEntryPenalty: number;
  readonly recentUtterancePenalty: number;
  readonly recentTemplatePenalty: number;
  readonly maximumGrammarCandidates: number;
  readonly minimumStagePracticeRounds: number;
  readonly minimumStageAttempts: number;
  readonly maximumStageErrorRate: number;
  readonly recentUtteranceLimit: number;
  readonly recentTemplateLimit: number;
}

export const FREQUENCY_FIRST_UTTERANCE_POLICY: FrequencyFirstUtterancePolicy = {
  version: "frequency-first-utterance-v1",
  frequencyBandWeights: { 1: 1, 2: 0.5, 3: 0.25 },
  minimumBindingAttempts: 4,
  minimumBindingTimingSamples: 3,
  minimumTransitionTimingSamples: 3,
  maximumExpectedTokenBoost: 1.45,
  maximumTransitionBoost: 1.25,
  maximumCombinedLearnerBoost: 1.5,
  errorBoostScale: 1.5,
  timingBoostScale: 0.35,
  transitionBoostScale: 0.3,
  recentEntryPenalty: 0.72,
  recentUtterancePenalty: 0.3,
  recentTemplatePenalty: 0.78,
  maximumGrammarCandidates: 2_000,
  minimumStagePracticeRounds: 3,
  minimumStageAttempts: 40,
  maximumStageErrorRate: 0.15,
  recentUtteranceLimit: 8,
  recentTemplateLimit: 6,
};

export interface FrequencyFirstSelectionState {
  readonly policyVersion: string;
  readonly stage: FrequencyStage;
  readonly stagePracticeRounds: number;
  readonly stageAttempts: number;
  readonly stageErrors: number;
  readonly recentUtteranceIds: readonly string[];
  readonly recentTemplateIds: readonly string[];
}

export interface UtteranceSelectionHistory {
  readonly recentEntryIds: readonly string[];
  readonly recentUtteranceIds: readonly string[];
  readonly recentTemplateIds: readonly string[];
}

export interface ExpectedTokenBoostTrace {
  readonly tokenId: TokenId;
  readonly attempts: number;
  readonly errors: number;
  readonly timingSamples: number;
  readonly errorRate: number | null;
  readonly timingRatio: number | null;
  readonly boost: number;
}

export interface TransitionBoostTrace {
  readonly fromToken: TokenId;
  readonly toToken: TokenId;
  readonly timingSamples: number;
  readonly timingRatio: number | null;
  readonly boost: number;
}

export interface UtteranceCandidateScore {
  readonly utteranceId: string;
  readonly templateId: string | null;
  readonly entryIds: readonly string[];
  readonly frequencyBase: number;
  readonly expectedTokenBoost: number;
  readonly transitionBoost: number;
  readonly combinedLearnerBoost: number;
  readonly recentEntryFactor: number;
  readonly recentUtteranceFactor: number;
  readonly recentTemplateFactor: number;
  readonly totalWeight: number;
  readonly expectedTokenTrace: readonly ExpectedTokenBoostTrace[];
  readonly transitionTrace: readonly TransitionBoostTrace[];
}

export interface FrequencyFirstUtteranceSelection {
  readonly policyVersion: string;
  readonly stage: FrequencyStage;
  readonly utterance: GrammarUtteranceCandidate;
  readonly score: UtteranceCandidateScore;
  readonly candidates: readonly UtteranceCandidateScore[];
  readonly grammarFallbackReasons: readonly string[];
}

export interface FrequencyFirstUtteranceInput {
  readonly entries: readonly CatalogEntry[];
  readonly annotations: Readonly<Record<string, GrammarAnnotation>>;
  readonly measurement: MeasurementSummary;
  readonly mode: PracticeMode;
  readonly layoutId: string;
  readonly stage: FrequencyStage;
  readonly history: UtteranceSelectionHistory;
  readonly policy: FrequencyFirstUtterancePolicy;
  readonly random: RandomSource;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function geometricMean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return Math.exp(values.reduce((sum, value) => sum + Math.log(value), 0) / values.length);
}

function uniqueTokens(candidate: GrammarUtteranceCandidate): readonly TokenId[] {
  return [...new Set(
    candidate.entries.flatMap((entry) =>
      entry.syllables.flatMap((syllable) => syllable.tokens),
    ),
  )].sort(compareText);
}

function exactTransitions(
  candidate: GrammarUtteranceCandidate,
): readonly { readonly fromToken: TokenId; readonly toToken: TokenId }[] {
  const keys = new Map<string, { fromToken: TokenId; toToken: TokenId }>();
  for (const entry of candidate.entries) {
    for (const syllable of entry.syllables) {
      for (let index = 1; index < syllable.tokens.length; index += 1) {
        const fromToken = syllable.tokens[index - 1]!;
        const toToken = syllable.tokens[index]!;
        keys.set(`${fromToken}\u0000${toToken}`, { fromToken, toToken });
      }
    }
  }
  return [...keys.values()].sort((left, right) =>
    compareText(left.fromToken, right.fromToken)
    || compareText(left.toToken, right.toToken)
  );
}

function expectedTokenTrace(
  candidate: GrammarUtteranceCandidate,
  input: FrequencyFirstUtteranceInput,
): readonly ExpectedTokenBoostTrace[] {
  return uniqueTokens(candidate).map((tokenId) => {
    const aggregate = input.measurement.bindings[bindingScopeKey({
      mode: input.mode,
      layoutId: input.layoutId,
      tokenId,
    })];
    if (aggregate === undefined) {
      return {
        tokenId,
        attempts: 0,
        errors: 0,
        timingSamples: 0,
        errorRate: null,
        timingRatio: null,
        boost: 1,
      };
    }
    const errorRate = aggregate.attempts >= input.policy.minimumBindingAttempts
      ? aggregate.errors / aggregate.attempts
      : null;
    const timingRatio = aggregate.timingSamples >= input.policy.minimumBindingTimingSamples
      && aggregate.currentTimeToTypeMs !== null
      && aggregate.bestTimeToTypeMs !== null
      && aggregate.bestTimeToTypeMs > 0
      ? aggregate.currentTimeToTypeMs / aggregate.bestTimeToTypeMs
      : null;
    const errorContribution = errorRate === null ? 0 : errorRate * input.policy.errorBoostScale;
    const timingContribution = timingRatio === null
      ? 0
      : Math.max(0, timingRatio - 1) * input.policy.timingBoostScale;
    return {
      tokenId,
      attempts: aggregate.attempts,
      errors: aggregate.errors,
      timingSamples: aggregate.timingSamples,
      errorRate,
      timingRatio,
      boost: clamp(
        1 + errorContribution + timingContribution,
        1,
        input.policy.maximumExpectedTokenBoost,
      ),
    };
  });
}

function transitionTrace(
  candidate: GrammarUtteranceCandidate,
  input: FrequencyFirstUtteranceInput,
): readonly TransitionBoostTrace[] {
  return exactTransitions(candidate).map(({ fromToken, toToken }) => {
    const aggregate = input.measurement.transitions[transitionScopeKey({
      mode: input.mode,
      layoutId: input.layoutId,
      fromToken,
      toToken,
    })];
    const timingRatio = aggregate !== undefined
      && aggregate.timingSamples >= input.policy.minimumTransitionTimingSamples
      && aggregate.bestTimeToTypeMs > 0
      ? aggregate.currentTimeToTypeMs / aggregate.bestTimeToTypeMs
      : null;
    return {
      fromToken,
      toToken,
      timingSamples: aggregate?.timingSamples ?? 0,
      timingRatio,
      boost: clamp(
        1 + (timingRatio === null
          ? 0
          : Math.max(0, timingRatio - 1) * input.policy.transitionBoostScale),
        1,
        input.policy.maximumTransitionBoost,
      ),
    };
  });
}

function scoreCandidate(
  candidate: GrammarUtteranceCandidate,
  input: FrequencyFirstUtteranceInput,
): UtteranceCandidateScore {
  const frequencyBase = geometricMean(candidate.entries.map((entry) =>
    input.policy.frequencyBandWeights[entry.frequencyBand]
  ));
  const expectedTrace = expectedTokenTrace(candidate, input);
  const transitions = transitionTrace(candidate, input);
  const expectedTokenBoost = Math.max(1, ...expectedTrace.map((item) => item.boost));
  const transitionBoost = Math.max(1, ...transitions.map((item) => item.boost));
  const combinedLearnerBoost = Math.min(
    input.policy.maximumCombinedLearnerBoost,
    expectedTokenBoost * transitionBoost,
  );
  const recentEntrySet = new Set(input.history.recentEntryIds);
  const recentEntryCount = candidate.entries.reduce(
    (count, entry) => count + (recentEntrySet.has(entry.id) ? 1 : 0),
    0,
  );
  const recentEntryFactor = Math.pow(input.policy.recentEntryPenalty, recentEntryCount);
  const recentUtteranceFactor = input.history.recentUtteranceIds.includes(candidate.id)
    ? input.policy.recentUtterancePenalty
    : 1;
  const recentTemplateFactor = candidate.templateId !== null
    && input.history.recentTemplateIds.includes(candidate.templateId)
    ? input.policy.recentTemplatePenalty
    : 1;
  return {
    utteranceId: candidate.id,
    templateId: candidate.templateId,
    entryIds: candidate.entries.map((entry) => entry.id),
    frequencyBase,
    expectedTokenBoost,
    transitionBoost,
    combinedLearnerBoost,
    recentEntryFactor,
    recentUtteranceFactor,
    recentTemplateFactor,
    totalWeight: frequencyBase
      * combinedLearnerBoost
      * recentEntryFactor
      * recentUtteranceFactor
      * recentTemplateFactor,
    expectedTokenTrace: expectedTrace,
    transitionTrace: transitions,
  };
}

export function validateFrequencyFirstUtterancePolicy(
  policy: FrequencyFirstUtterancePolicy,
): void {
  if (policy.version.length === 0) throw new Error("utterance policy version must not be empty");
  for (const stage of [1, 2, 3] as const) {
    if (!Number.isFinite(policy.frequencyBandWeights[stage])
      || policy.frequencyBandWeights[stage] <= 0) {
      throw new RangeError("frequency band weights must be finite and positive");
    }
  }
  if (!(policy.frequencyBandWeights[1] > policy.frequencyBandWeights[2]
    && policy.frequencyBandWeights[2] > policy.frequencyBandWeights[3])) {
    throw new RangeError("frequency band weights must decrease by stage");
  }
  const positiveIntegers = [
    policy.minimumBindingAttempts,
    policy.minimumBindingTimingSamples,
    policy.minimumTransitionTimingSamples,
    policy.maximumGrammarCandidates,
    policy.minimumStagePracticeRounds,
    policy.minimumStageAttempts,
    policy.recentUtteranceLimit,
    policy.recentTemplateLimit,
  ];
  if (positiveIntegers.some((value) => !Number.isInteger(value) || value <= 0)) {
    throw new RangeError("utterance policy counts must be positive integers");
  }
  if (policy.maximumStageErrorRate < 0 || policy.maximumStageErrorRate > 1) {
    throw new RangeError("maximum stage error rate must be between 0 and 1");
  }
  for (const factor of [
    policy.recentEntryPenalty,
    policy.recentUtterancePenalty,
    policy.recentTemplatePenalty,
  ]) {
    if (!Number.isFinite(factor) || factor <= 0 || factor > 1) {
      throw new RangeError("recent penalties must be in (0, 1]");
    }
  }
  for (const boost of [
    policy.maximumExpectedTokenBoost,
    policy.maximumTransitionBoost,
    policy.maximumCombinedLearnerBoost,
  ]) {
    if (!Number.isFinite(boost) || boost < 1) {
      throw new RangeError("maximum boosts must be finite and at least 1");
    }
  }
}

export function createFrequencyFirstSelectionState(
  policy: FrequencyFirstUtterancePolicy,
): FrequencyFirstSelectionState {
  validateFrequencyFirstUtterancePolicy(policy);
  return {
    policyVersion: policy.version,
    stage: 1,
    stagePracticeRounds: 0,
    stageAttempts: 0,
    stageErrors: 0,
    recentUtteranceIds: [],
    recentTemplateIds: [],
  };
}

export function selectFrequencyFirstUtterance(
  input: FrequencyFirstUtteranceInput,
): FrequencyFirstUtteranceSelection {
  validateFrequencyFirstUtterancePolicy(input.policy);
  const eligibleEntries = input.entries.filter((entry) => entry.frequencyBand <= input.stage);
  const grammar = composeGrammarCandidates(
    eligibleEntries,
    input.annotations,
    undefined,
    { maximumCandidates: input.policy.maximumGrammarCandidates },
  );
  if (grammar.candidates.length === 0) {
    throw new Error(`no grammar-valid utterance candidate: ${grammar.fallbackReasons.join(",")}`);
  }
  const candidateById = new Map(grammar.candidates.map((candidate) => [candidate.id, candidate]));
  const scored = grammar.candidates.map((candidate) => scoreCandidate(candidate, input));
  const selectedId = weightedPick(
    scored.map((score) => ({ value: score.utteranceId, weight: score.totalWeight })),
    input.random,
  );
  const utterance = candidateById.get(selectedId);
  const score = scored.find((candidate) => candidate.utteranceId === selectedId);
  if (utterance === undefined || score === undefined) {
    throw new Error("selected utterance disappeared from canonical candidate set");
  }
  return {
    policyVersion: input.policy.version,
    stage: input.stage,
    utterance,
    score,
    candidates: [...scored].sort((left, right) =>
      right.totalWeight - left.totalWeight
      || compareText(left.utteranceId, right.utteranceId)
    ),
    grammarFallbackReasons: grammar.fallbackReasons,
  };
}

function appendRecent(
  values: readonly string[],
  value: string | null,
  limit: number,
): readonly string[] {
  if (value === null) return values.slice(-limit);
  return [...values.filter((item) => item !== value), value].slice(-limit);
}

export function updateFrequencyFirstSelectionState(
  state: FrequencyFirstSelectionState,
  selection: FrequencyFirstUtteranceSelection,
  attempts: number,
  errors: number,
  policy: FrequencyFirstUtterancePolicy,
): FrequencyFirstSelectionState {
  if (state.policyVersion !== policy.version || selection.policyVersion !== policy.version) {
    throw new Error("utterance policy version mismatch");
  }
  if (!Number.isInteger(attempts) || attempts < 0
    || !Number.isInteger(errors) || errors < 0 || errors > attempts) {
    throw new RangeError("round attempts and errors must be valid non-negative integers");
  }
  const stagePracticeRounds = state.stagePracticeRounds + 1;
  const stageAttempts = state.stageAttempts + attempts;
  const stageErrors = state.stageErrors + errors;
  const errorRate = stageAttempts === 0 ? 0 : stageErrors / stageAttempts;
  const unlock = state.stage < 3
    && stagePracticeRounds >= policy.minimumStagePracticeRounds
    && stageAttempts >= policy.minimumStageAttempts
    && errorRate <= policy.maximumStageErrorRate;
  return {
    policyVersion: policy.version,
    stage: unlock ? (state.stage + 1) as FrequencyStage : state.stage,
    stagePracticeRounds: unlock ? 0 : stagePracticeRounds,
    stageAttempts: unlock ? 0 : stageAttempts,
    stageErrors: unlock ? 0 : stageErrors,
    recentUtteranceIds: appendRecent(
      state.recentUtteranceIds,
      selection.utterance.id,
      policy.recentUtteranceLimit,
    ),
    recentTemplateIds: appendRecent(
      state.recentTemplateIds,
      selection.utterance.templateId,
      policy.recentTemplateLimit,
    ),
  };
}

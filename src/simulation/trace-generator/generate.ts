import type { Exercise, InputLayout, TokenId } from "../../core/model.js";
import type { MeasurementPolicy } from "../../measurement/types.js";
import { validateMeasurementPolicy } from "../../measurement/policy.js";
import {
  applyInteractionInput,
  createInteractionSession,
  type ExerciseTarget,
  type InteractionInput,
  type InteractionSessionState,
} from "../../practice/interaction-session.js";
import { Mulberry32Random, sampleLogNormalLatency, samplePositiveScale } from "../learner/random.js";
import {
  applyExposureAndRetention,
  confusionTruthKey,
  snapshotLatentTruth,
  transitionTruthKey,
  validateSyntheticLearnerState,
  type SyntheticExposure,
} from "../learner/state.js";
import type {
  BindingTruth,
  GenerationNoiseReason,
  GenerationResponseReason,
  GenerationTimingReason,
  LogNormalLatencyTruth,
  SyntheticGenerationDecision,
  SyntheticLearnerState,
  SyntheticTraceBatch,
} from "../learner/types.js";
import { createDeterminismDigest } from "./digest.js";
import { estimateMeasurements, reportEstimationError } from "./estimate.js";

export interface SyntheticTraceGenerationOptions {
  readonly scenarioId: string;
  readonly seed: number;
  readonly startedAtMs: number;
  readonly retentionSteps?: number;
}

interface ReverseLayout {
  readonly primaryCodeByToken: ReadonlyMap<TokenId, string>;
}

interface TimingSelection {
  readonly latencyTruth: LogNormalLatencyTruth;
  readonly timingReason: GenerationTimingReason;
  readonly transitionKey: string | null;
  readonly boundaryAdjustmentMs: number;
}

function compareKeys(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function roundMs(value: number): number {
  return Math.round(Math.max(0.001, value) * 1000) / 1000;
}

function reverseLayout(layout: InputLayout): ReverseLayout {
  const codesByToken = new Map<TokenId, string[]>();
  for (const [physicalCode, tokenId] of Object.entries(layout.bindings)) {
    const codes = codesByToken.get(tokenId) ?? [];
    codes.push(physicalCode);
    codesByToken.set(tokenId, codes);
  }
  const primaryCodeByToken = new Map<TokenId, string>();
  for (const [tokenId, codes] of codesByToken) {
    const primary = [...codes].sort(compareKeys)[0];
    if (primary !== undefined) primaryCodeByToken.set(tokenId, primary);
  }
  return { primaryCodeByToken };
}

function requiredPhysicalCode(reverse: ReverseLayout, tokenId: TokenId): string {
  const code = reverse.primaryCodeByToken.get(tokenId);
  if (code === undefined) throw new Error(`layout does not map token ${tokenId}`);
  return code;
}

function validateGenerationInputs(
  exercise: Exercise,
  layout: InputLayout,
  learner: SyntheticLearnerState,
  reverse: ReverseLayout,
): void {
  validateSyntheticLearnerState(learner);
  if (exercise.layoutId !== layout.id) {
    throw new Error(`exercise layout ${exercise.layoutId} does not match input layout ${layout.id}`);
  }
  for (const entry of exercise.entries) {
    for (const syllable of entry.syllables) {
      for (const tokenId of syllable.tokens) {
        requiredPhysicalCode(reverse, tokenId);
        const binding = learner.bindings[tokenId];
        if (binding === undefined) throw new Error(`learner has no binding truth for token ${tokenId}`);
        requiredPhysicalCode(reverse, binding.fallbackActualToken);
      }
    }
  }
  for (const confusion of Object.values(learner.confusions)) {
    requiredPhysicalCode(reverse, confusion.expectedToken);
    requiredPhysicalCode(reverse, confusion.actualToken);
    const fallback = learner.bindings[confusion.expectedToken]?.fallbackActualToken;
    if (fallback === confusion.actualToken) {
      throw new Error(
        `binding fallback for ${confusion.expectedToken} must differ from named confusion ${confusion.actualToken}`,
      );
    }
  }
}

function selectTiming(
  target: ExerciseTarget,
  previousToken: TokenId | null,
  binding: BindingTruth,
  learner: SyntheticLearnerState,
): TimingSelection {
  if (target.context === "exercise-start") {
    return {
      latencyTruth: learner.context.exerciseStartLatency,
      timingReason: "exercise-boundary-truth",
      transitionKey: null,
      boundaryAdjustmentMs: binding.boundaryResponseAdjustmentMs,
    };
  }
  if (target.context === "entry-start") {
    return {
      latencyTruth: learner.context.entryStartLatency,
      timingReason: "entry-boundary-truth",
      transitionKey: null,
      boundaryAdjustmentMs: binding.boundaryResponseAdjustmentMs,
    };
  }
  if (target.context === "syllable-start") {
    return {
      latencyTruth: learner.context.syllableStartLatency,
      timingReason: "syllable-boundary-truth",
      transitionKey: null,
      boundaryAdjustmentMs: binding.boundaryResponseAdjustmentMs,
    };
  }
  if (previousToken === null) {
    throw new Error(`motor target ${target.position} has no previous token`);
  }
  const key = transitionTruthKey(previousToken, target.tokenId);
  const transition = learner.transitions[key];
  return transition === undefined
    ? {
        latencyTruth: learner.context.defaultTransitionLatency,
        timingReason: "default-transition-fallback",
        transitionKey: key,
        boundaryAdjustmentMs: 0,
      }
    : {
        latencyTruth: transition.latency,
        timingReason: "directional-transition-truth",
        transitionKey: key,
        boundaryAdjustmentMs: 0,
      };
}

function noiseReason(
  draw: number,
  learner: SyntheticLearnerState,
): GenerationNoiseReason {
  const unmappedEnd = learner.context.unmappedNoiseProbability;
  const repeatEnd = unmappedEnd + learner.context.heldRepeatProbability;
  const compositionEnd = repeatEnd + learner.context.compositionInterruptionProbability;
  if (draw < unmappedEnd) return "unmapped-interaction-noise";
  if (draw < repeatEnd) return "held-repeat-interaction-noise";
  if (draw < compositionEnd) return "composition-interruption-noise";
  return "no-interaction-noise";
}

function noiseInput(
  reason: GenerationNoiseReason,
  timestampMs: number,
  expectedToken: TokenId,
  expectedPhysicalCode: string,
): InteractionInput | null {
  if (reason === "no-interaction-noise") return null;
  if (reason === "unmapped-interaction-noise") {
    return {
      timestampMs,
      physicalCode: "Unmapped",
      actualToken: null,
      repeat: false,
      composing: false,
      modifierOnly: false,
    };
  }
  if (reason === "held-repeat-interaction-noise") {
    return {
      timestampMs,
      physicalCode: expectedPhysicalCode,
      actualToken: expectedToken,
      repeat: true,
      composing: false,
      modifierOnly: false,
    };
  }
  return {
    timestampMs,
    physicalCode: "Process",
    actualToken: null,
    repeat: false,
    composing: true,
    modifierOnly: false,
  };
}

function chooseActualToken(
  expectedToken: TokenId,
  binding: BindingTruth,
  learner: SyntheticLearnerState,
  error: boolean,
  draw: number,
): { readonly actualToken: TokenId; readonly reason: GenerationResponseReason } {
  if (!error) return { actualToken: expectedToken, reason: "binding-correct" };
  let cumulative = 0;
  for (const key of Object.keys(learner.confusions).sort(compareKeys)) {
    const confusion = learner.confusions[key];
    if (confusion === undefined || confusion.expectedToken !== expectedToken) continue;
    cumulative += confusion.conditionalProbability;
    if (draw < cumulative) {
      return {
        actualToken: confusion.actualToken,
        reason: "named-directional-confusion",
      };
    }
  }
  return {
    actualToken: binding.fallbackActualToken,
    reason: "generic-binding-error-fallback",
  };
}

function applyInput(
  state: InteractionSessionState,
  input: InteractionInput,
): InteractionSessionState {
  const next = applyInteractionInput(state, input);
  if (next === state) throw new Error("interaction input did not advance or append a trace");
  return next;
}

export function generateSyntheticTraceBatch(
  exercise: Exercise,
  layout: InputLayout,
  measurementPolicy: MeasurementPolicy,
  learner: SyntheticLearnerState,
  options: SyntheticTraceGenerationOptions,
): SyntheticTraceBatch {
  validateMeasurementPolicy(measurementPolicy);
  const reverse = reverseLayout(layout);
  validateGenerationInputs(exercise, layout, learner, reverse);
  const retentionSteps = options.retentionSteps ?? 0;
  if (!Number.isInteger(retentionSteps) || retentionSteps < 0) {
    throw new RangeError("retentionSteps must be a non-negative integer");
  }

  const beforeTruth = snapshotLatentTruth(learner, "before");
  const random = new Mulberry32Random(options.seed);
  const sessionScale = samplePositiveScale(
    learner.context.sessionLatencyScaleStandardDeviation,
    random,
  );
  let session = createInteractionSession(exercise, options.startedAtMs);
  const generationDecisions: SyntheticGenerationDecision[] = [];
  const exposures: SyntheticExposure[] = [];

  while (!session.completed) {
    const target = session.targets[session.position];
    if (target === undefined) break;
    const binding = learner.bindings[target.tokenId];
    if (binding === undefined) throw new Error(`learner has no binding truth for ${target.tokenId}`);
    const previousToken = target.position > 0
      ? session.targets[target.position - 1]?.tokenId ?? null
      : null;
    const timing = selectTiming(target, previousToken, binding, learner);
    const observationScale = samplePositiveScale(
      learner.context.observationLatencyScaleStandardDeviation,
      random,
    );
    const sampledLatency = sampleLogNormalLatency(timing.latencyTruth, random);
    const plannedLatencyMs = roundMs(
      (sampledLatency + timing.boundaryAdjustmentMs) * sessionScale * observationScale,
    );
    const expectedCode = requiredPhysicalCode(reverse, target.tokenId);
    const traceStart = session.traces.length;
    const selectedNoiseReason = noiseReason(random.next(), learner);
    const noise = noiseInput(
      selectedNoiseReason,
      roundMs(session.lastAdvanceTimestampMs + plannedLatencyMs / 2),
      target.tokenId,
      expectedCode,
    );
    if (noise !== null) session = applyInput(session, noise);

    const error = random.next() < binding.errorProbability;
    const selected = chooseActualToken(
      target.tokenId,
      binding,
      learner,
      error,
      random.next(),
    );
    const attemptTimestampMs = roundMs(session.lastAdvanceTimestampMs + plannedLatencyMs);
    const actualCode = requiredPhysicalCode(reverse, selected.actualToken);
    session = applyInput(session, {
      timestampMs: attemptTimestampMs,
      physicalCode: actualCode,
      actualToken: selected.actualToken,
      repeat: false,
      composing: false,
      modifierOnly: false,
    });

    let recovered = false;
    if (error) {
      const recoveryScale = samplePositiveScale(
        learner.context.observationLatencyScaleStandardDeviation,
        random,
      );
      const recoveryDelayMs = roundMs(
        sampleLogNormalLatency(learner.context.recoveryDelay, random)
          * sessionScale
          * recoveryScale,
      );
      session = applyInput(session, {
        timestampMs: roundMs(attemptTimestampMs + recoveryDelayMs),
        physicalCode: expectedCode,
        actualToken: target.tokenId,
        repeat: false,
        composing: false,
        modifierOnly: false,
      });
      recovered = true;
    }

    const traceSequences = session.traces
      .slice(traceStart)
      .map((trace) => trace.sequence);
    generationDecisions.push({
      targetPosition: target.position,
      expectedToken: target.tokenId,
      context: target.context,
      transitionKey: timing.transitionKey,
      plannedLatencyMs,
      timingReason: timing.timingReason,
      noiseReason: selectedNoiseReason,
      responseReason: selected.reason,
      actualToken: selected.actualToken,
      recovered,
      traceSequences,
      physicalCodeSelectionReason: "lexicographically-first-layout-code",
    });
    exposures.push({
      expectedToken: target.tokenId,
      transitionKey: timing.transitionKey,
      firstAttemptCorrect: !error,
      recovered,
    });
  }

  const stopReason: SyntheticTraceBatch["stopReason"] = session.targets.length === 0
    ? "empty-sequence"
    : "sequence-complete";
  const measurementEstimate = estimateMeasurements(exercise, session.traces, measurementPolicy);
  const estimationErrorReport = reportEstimationError(learner, measurementEstimate);
  const updateResult = applyExposureAndRetention(learner, exposures, retentionSteps);
  const afterTruth = snapshotLatentTruth(updateResult.state, "after");
  const digestPayload = {
    scenarioId: options.scenarioId,
    seed: options.seed,
    exercise,
    layoutId: layout.id,
    startedAtMs: options.startedAtMs,
    traces: session.traces,
    generationDecisions,
    stopReason,
    beforeTruth,
    afterTruth,
    exposureUpdate: updateResult.update,
    measurementEstimate,
    estimationErrorReport,
    orderingReason: "semantic-target-order" as const,
  };
  return {
    ...digestPayload,
    determinismDigest: createDeterminismDigest(digestPayload),
  };
}

export function namedConfusionProbability(
  learner: SyntheticLearnerState,
  expectedToken: TokenId,
  actualToken: TokenId,
): number {
  return learner.confusions[confusionTruthKey(expectedToken, actualToken)]
    ?.conditionalProbability ?? 0;
}

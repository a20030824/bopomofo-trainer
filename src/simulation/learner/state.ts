import type { TokenId } from "../../core/model.js";
import type {
  BindingTruth,
  ConfusionTruth,
  ExposureEvent,
  ExposureSkip,
  ExposureUpdate,
  LatentTruthSnapshot,
  SyntheticLearnerState,
  TransitionTruth,
} from "./types.js";

export interface SyntheticExposure {
  readonly expectedToken: TokenId;
  readonly transitionKey: string | null;
  readonly firstAttemptCorrect: boolean;
  readonly recovered: boolean;
}

function compareKeys(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sortedRecord<T>(record: Readonly<Record<string, T>>): Readonly<Record<string, T>> {
  return Object.fromEntries(
    Object.entries(record).sort(([left], [right]) => compareKeys(left, right)),
  );
}

function roundProbability(value: number): number {
  return Math.round(Math.min(1, Math.max(0, value)) * 1e12) / 1e12;
}

function roundLatency(value: number): number {
  return Math.round(Math.max(0.001, value) * 1000) / 1000;
}

function roundStandardDeviation(value: number): number {
  return Math.round(Math.max(0, value) * 1000) / 1000;
}

export function transitionTruthKey(fromToken: TokenId, toToken: TokenId): string {
  return JSON.stringify([fromToken, toToken]);
}

export function confusionTruthKey(expectedToken: TokenId, actualToken: TokenId): string {
  return JSON.stringify([expectedToken, actualToken]);
}

export function snapshotLatentTruth(
  state: SyntheticLearnerState,
  phase: "before" | "after",
): LatentTruthSnapshot {
  return {
    phase,
    state: {
      ...state,
      bindings: sortedRecord(state.bindings),
      transitions: sortedRecord(state.transitions),
      confusions: sortedRecord(state.confusions),
    },
    orderingReason: "code-unit-sorted-relation-keys",
  };
}

function assertProbability(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`${name} must be between 0 and 1`);
  }
}

function validateLatency(meanMs: number, standardDeviationMs: number, name: string): void {
  if (!Number.isFinite(meanMs) || meanMs <= 0) {
    throw new RangeError(`${name}.meanMs must be finite and positive`);
  }
  if (!Number.isFinite(standardDeviationMs) || standardDeviationMs < 0) {
    throw new RangeError(`${name}.standardDeviationMs must be finite and non-negative`);
  }
}

export function validateSyntheticLearnerState(state: SyntheticLearnerState): void {
  if (state.version !== "synthetic-relational-v1") {
    throw new Error(`unsupported synthetic learner version ${state.version}`);
  }
  if (!Number.isInteger(state.sessionIndex) || state.sessionIndex < 0) {
    throw new RangeError("sessionIndex must be a non-negative integer");
  }

  for (const [key, binding] of Object.entries(state.bindings)) {
    if (key !== binding.tokenId) throw new Error(`binding key ${key} does not match ${binding.tokenId}`);
    if (binding.fallbackActualToken === binding.tokenId) {
      throw new Error(`binding ${key} fallbackActualToken must differ from the expected token`);
    }
    assertProbability(binding.errorProbability, `binding ${key} errorProbability`);
    assertProbability(binding.learningRate, `binding ${key} learningRate`);
    assertProbability(binding.decayRatePerStep, `binding ${key} decayRatePerStep`);
    if (!Number.isFinite(binding.boundaryResponseAdjustmentMs)) {
      throw new RangeError(`binding ${key} boundaryResponseAdjustmentMs must be finite`);
    }
  }

  for (const [key, transition] of Object.entries(state.transitions)) {
    if (key !== transitionTruthKey(transition.fromToken, transition.toToken)) {
      throw new Error(`transition key ${key} does not match its directional tokens`);
    }
    validateLatency(
      transition.latency.meanMs,
      transition.latency.standardDeviationMs,
      `transition ${key} latency`,
    );
    assertProbability(transition.learningRate, `transition ${key} learningRate`);
    assertProbability(transition.decayRatePerStep, `transition ${key} decayRatePerStep`);
    for (const transfer of transition.transfer) {
      assertProbability(transfer.factor, `transition ${key} transfer factor`);
      if (transfer.targetTransitionKey === key) {
        throw new Error(`transition ${key} cannot transfer to itself`);
      }
      if (state.transitions[transfer.targetTransitionKey] === undefined) {
        throw new Error(
          `transition ${key} transfer target ${transfer.targetTransitionKey} is not declared`,
        );
      }
    }
  }

  const confusionSums = new Map<string, number>();
  for (const [key, confusion] of Object.entries(state.confusions)) {
    if (key !== confusionTruthKey(confusion.expectedToken, confusion.actualToken)) {
      throw new Error(`confusion key ${key} does not match its directional tokens`);
    }
    if (confusion.expectedToken === confusion.actualToken) {
      throw new Error(`confusion ${key} must substitute a different token`);
    }
    assertProbability(
      confusion.conditionalProbability,
      `confusion ${key} conditionalProbability`,
    );
    assertProbability(confusion.learningRate, `confusion ${key} learningRate`);
    assertProbability(confusion.decayRatePerStep, `confusion ${key} decayRatePerStep`);
    confusionSums.set(
      confusion.expectedToken,
      (confusionSums.get(confusion.expectedToken) ?? 0) + confusion.conditionalProbability,
    );
  }
  for (const [expectedToken, sum] of confusionSums) {
    if (sum > 1 + 1e-12) {
      throw new RangeError(
        `confusion conditional probabilities for ${expectedToken} sum to ${sum}, expected at most 1`,
      );
    }
  }

  validateLatency(
    state.context.exerciseStartLatency.meanMs,
    state.context.exerciseStartLatency.standardDeviationMs,
    "exerciseStartLatency",
  );
  validateLatency(
    state.context.entryStartLatency.meanMs,
    state.context.entryStartLatency.standardDeviationMs,
    "entryStartLatency",
  );
  validateLatency(
    state.context.syllableStartLatency.meanMs,
    state.context.syllableStartLatency.standardDeviationMs,
    "syllableStartLatency",
  );
  validateLatency(
    state.context.defaultTransitionLatency.meanMs,
    state.context.defaultTransitionLatency.standardDeviationMs,
    "defaultTransitionLatency",
  );
  validateLatency(
    state.context.recoveryDelay.meanMs,
    state.context.recoveryDelay.standardDeviationMs,
    "recoveryDelay",
  );
  assertProbability(state.context.unmappedNoiseProbability, "unmappedNoiseProbability");
  assertProbability(state.context.heldRepeatProbability, "heldRepeatProbability");
  assertProbability(
    state.context.compositionInterruptionProbability,
    "compositionInterruptionProbability",
  );
  const noiseTotal = state.context.unmappedNoiseProbability
    + state.context.heldRepeatProbability
    + state.context.compositionInterruptionProbability;
  if (noiseTotal > 1 + 1e-12) {
    throw new RangeError(`interaction-noise probabilities sum to ${noiseTotal}, expected at most 1`);
  }
  if (
    !Number.isFinite(state.context.sessionLatencyScaleStandardDeviation)
    || state.context.sessionLatencyScaleStandardDeviation < 0
  ) {
    throw new RangeError("sessionLatencyScaleStandardDeviation must be non-negative");
  }
  if (
    !Number.isFinite(state.context.observationLatencyScaleStandardDeviation)
    || state.context.observationLatencyScaleStandardDeviation < 0
  ) {
    throw new RangeError("observationLatencyScaleStandardDeviation must be non-negative");
  }
}

function updatedBinding(binding: BindingTruth, credit: number): BindingTruth {
  const factor = 1 - binding.learningRate * credit;
  return { ...binding, errorProbability: roundProbability(binding.errorProbability * factor) };
}

function updatedTransition(transition: TransitionTruth, credit: number): TransitionTruth {
  const factor = Math.max(0.05, 1 - transition.learningRate * credit);
  return {
    ...transition,
    latency: {
      meanMs: roundLatency(transition.latency.meanMs * factor),
      standardDeviationMs: roundStandardDeviation(
        transition.latency.standardDeviationMs * factor,
      ),
    },
  };
}

function updatedConfusion(confusion: ConfusionTruth, credit: number): ConfusionTruth {
  const factor = 1 - confusion.learningRate * credit;
  return {
    ...confusion,
    conditionalProbability: roundProbability(confusion.conditionalProbability * factor),
  };
}

function applyExposure(
  state: SyntheticLearnerState,
  exposures: readonly SyntheticExposure[],
): {
  readonly state: SyntheticLearnerState;
  readonly events: readonly ExposureEvent[];
  readonly skipped: readonly ExposureSkip[];
} {
  const bindings: Record<string, BindingTruth> = { ...state.bindings };
  const transitions: Record<string, TransitionTruth> = { ...state.transitions };
  const confusions: Record<string, ConfusionTruth> = { ...state.confusions };
  const events: ExposureEvent[] = [];
  const skipped: ExposureSkip[] = [];

  for (const exposure of exposures) {
    const binding = bindings[exposure.expectedToken];
    if (binding !== undefined) {
      const credit = exposure.firstAttemptCorrect ? 1 : exposure.recovered ? 0.5 : 0;
      const next = updatedBinding(binding, credit);
      bindings[exposure.expectedToken] = next;
      events.push({
        relationKind: "binding",
        relationKey: exposure.expectedToken,
        before: binding.errorProbability,
        after: next.errorProbability,
        credit,
        reason: "semantic-binding-exposure",
      });

      for (const key of Object.keys(confusions).sort(compareKeys)) {
        const confusion = confusions[key];
        if (confusion === undefined || confusion.expectedToken !== exposure.expectedToken) continue;
        const nextConfusion = updatedConfusion(confusion, credit);
        confusions[key] = nextConfusion;
        events.push({
          relationKind: "confusion",
          relationKey: key,
          before: confusion.conditionalProbability,
          after: nextConfusion.conditionalProbability,
          credit,
          reason: "named-confusion-exposure",
        });
      }
    }

    if (exposure.transitionKey === null) continue;
    const transition = transitions[exposure.transitionKey];
    if (transition === undefined) {
      skipped.push({
        relationKind: "transition",
        relationKey: exposure.transitionKey,
        reason: "undeclared-transition-fallback-has-no-latent-update",
      });
      continue;
    }
    const credit = exposure.firstAttemptCorrect ? 1 : exposure.recovered ? 0.25 : 0;
    const nextTransition = updatedTransition(transition, credit);
    transitions[exposure.transitionKey] = nextTransition;
    events.push({
      relationKind: "transition",
      relationKey: exposure.transitionKey,
      before: transition.latency.meanMs,
      after: nextTransition.latency.meanMs,
      credit,
      reason: exposure.firstAttemptCorrect
        ? "clean-transition-exposure"
        : "recovered-transition-partial-credit",
    });

    for (const transfer of [...transition.transfer].sort((left, right) =>
      compareKeys(left.targetTransitionKey, right.targetTransitionKey)
    )) {
      const target = transitions[transfer.targetTransitionKey];
      if (target === undefined) continue;
      const transferCredit = credit * transfer.factor;
      const nextTarget = updatedTransition(target, transferCredit);
      transitions[transfer.targetTransitionKey] = nextTarget;
      events.push({
        relationKind: "transition",
        relationKey: transfer.targetTransitionKey,
        before: target.latency.meanMs,
        after: nextTarget.latency.meanMs,
        credit: transferCredit,
        reason: "explicit-transition-transfer",
      });
    }
  }

  return {
    state: {
      ...state,
      sessionIndex: state.sessionIndex + 1,
      bindings: sortedRecord(bindings),
      transitions: sortedRecord(transitions),
      confusions: sortedRecord(confusions),
    },
    events,
    skipped,
  };
}

function decayProbability(value: number, rate: number, steps: number): number {
  const retained = (1 - rate) ** steps;
  return roundProbability(1 - (1 - value) * retained);
}

function applyDecay(
  state: SyntheticLearnerState,
  steps: number,
): { readonly state: SyntheticLearnerState; readonly events: readonly ExposureEvent[] } {
  if (steps === 0) return { state, events: [] };
  const bindings: Record<string, BindingTruth> = {};
  const transitions: Record<string, TransitionTruth> = {};
  const desiredConfusions: Record<string, ConfusionTruth> = {};
  const events: ExposureEvent[] = [];

  for (const key of Object.keys(state.bindings).sort(compareKeys)) {
    const binding = state.bindings[key];
    if (binding === undefined) continue;
    const nextValue = decayProbability(
      binding.errorProbability,
      binding.decayRatePerStep,
      steps,
    );
    bindings[key] = { ...binding, errorProbability: nextValue };
    events.push({
      relationKind: "binding",
      relationKey: key,
      before: binding.errorProbability,
      after: nextValue,
      credit: steps,
      reason: "binding-retention-decay",
    });
  }

  for (const key of Object.keys(state.transitions).sort(compareKeys)) {
    const transition = state.transitions[key];
    if (transition === undefined) continue;
    const factor = 1 + transition.decayRatePerStep * steps;
    const nextMean = roundLatency(transition.latency.meanMs * factor);
    transitions[key] = {
      ...transition,
      latency: {
        meanMs: nextMean,
        standardDeviationMs: roundStandardDeviation(
          transition.latency.standardDeviationMs * factor,
        ),
      },
    };
    events.push({
      relationKind: "transition",
      relationKey: key,
      before: transition.latency.meanMs,
      after: nextMean,
      credit: steps,
      reason: "transition-retention-decay",
    });
  }

  for (const key of Object.keys(state.confusions).sort(compareKeys)) {
    const confusion = state.confusions[key];
    if (confusion === undefined) continue;
    desiredConfusions[key] = {
      ...confusion,
      conditionalProbability: decayProbability(
        confusion.conditionalProbability,
        confusion.decayRatePerStep,
        steps,
      ),
    };
  }

  const confusionGroups = new Map<string, string[]>();
  for (const key of Object.keys(desiredConfusions).sort(compareKeys)) {
    const confusion = desiredConfusions[key];
    if (confusion === undefined) continue;
    const group = confusionGroups.get(confusion.expectedToken) ?? [];
    group.push(key);
    confusionGroups.set(confusion.expectedToken, group);
  }

  const confusions: Record<string, ConfusionTruth> = {};
  for (const [expectedToken, keys] of [...confusionGroups.entries()].sort(([left], [right]) =>
    compareKeys(left, right)
  )) {
    const sum = keys.reduce(
      (total, key) => total + (desiredConfusions[key]?.conditionalProbability ?? 0),
      0,
    );
    const scale = sum > 1 ? 1 / sum : 1;
    for (const key of keys) {
      const before = state.confusions[key];
      const desired = desiredConfusions[key];
      if (before === undefined || desired === undefined) continue;
      const after = roundProbability(desired.conditionalProbability * scale);
      confusions[key] = { ...desired, conditionalProbability: after };
      events.push({
        relationKind: "confusion",
        relationKey: key,
        before: before.conditionalProbability,
        after,
        credit: steps,
        reason: sum > 1
          ? "confusion-decay-probability-cap"
          : "confusion-retention-decay",
      });
    }
    void expectedToken;
  }

  return {
    state: {
      ...state,
      bindings: sortedRecord(bindings),
      transitions: sortedRecord(transitions),
      confusions: sortedRecord(confusions),
    },
    events,
  };
}

export function applyExposureAndRetention(
  state: SyntheticLearnerState,
  exposures: readonly SyntheticExposure[],
  retentionSteps: number,
): { readonly state: SyntheticLearnerState; readonly update: ExposureUpdate } {
  if (!Number.isInteger(retentionSteps) || retentionSteps < 0) {
    throw new RangeError("retentionSteps must be a non-negative integer");
  }
  const exposureResult = applyExposure(state, exposures);
  const decayResult = applyDecay(exposureResult.state, retentionSteps);
  return {
    state: decayResult.state,
    update: {
      events: [...exposureResult.events, ...decayResult.events],
      skipped: exposureResult.skipped,
      retentionSteps,
      updateOrderReason: "semantic-target-order-then-explicit-transfer-then-decay",
    },
  };
}

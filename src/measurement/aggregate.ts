import { validateMeasurementPolicy } from "./policy.js";
import type {
  BindingAggregate,
  BindingObservation,
  ConfusionAggregate,
  ConfusionObservation,
  MeasurementPolicy,
  MeasurementSummary,
  TimingExclusionCounts,
  TraceMeasurementDecision,
  TransitionAggregate,
  TransitionObservation,
} from "./types.js";

export function bindingScopeKey(scope: BindingObservation["scope"]): string {
  return JSON.stringify([scope.mode, scope.layoutId, scope.tokenId]);
}

export function confusionScopeKey(scope: ConfusionObservation["scope"]): string {
  return JSON.stringify([
    scope.mode,
    scope.layoutId,
    scope.expectedToken,
    scope.actualToken,
  ]);
}

export function transitionScopeKey(scope: TransitionObservation["scope"]): string {
  return JSON.stringify([scope.mode, scope.layoutId, scope.fromToken, scope.toToken]);
}

export function smoothTiming(
  previousMs: number | null,
  sampleMs: number,
  alpha: number,
): number {
  if (!Number.isFinite(sampleMs) || sampleMs < 0) {
    throw new RangeError("timing sample must be finite and non-negative");
  }
  if (!Number.isFinite(alpha) || alpha <= 0 || alpha > 1) {
    throw new RangeError("alpha must be greater than 0 and at most 1");
  }

  const value = previousMs === null
    ? sampleMs
    : previousMs + alpha * (sampleMs - previousMs);
  return Math.round(value * 1000) / 1000;
}

function emptyTimingExclusions(): TimingExclusionCounts {
  return {
    syllableStart: 0,
    incorrect: 0,
    recovery: 0,
    interactionNoise: 0,
  };
}

function incrementTimingExclusion(
  counts: TimingExclusionCounts,
  reason: BindingObservation["timingExclusionReason"],
): TimingExclusionCounts {
  if (reason === null) return counts;
  if (reason === "syllable-start") {
    return { ...counts, syllableStart: counts.syllableStart + 1 };
  }
  if (reason === "incorrect") {
    return { ...counts, incorrect: counts.incorrect + 1 };
  }
  if (reason === "recovery") {
    return { ...counts, recovery: counts.recovery + 1 };
  }
  return { ...counts, interactionNoise: counts.interactionNoise + 1 };
}

function compareKeys(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sortedRecord<T>(map: ReadonlyMap<string, T>): Readonly<Record<string, T>> {
  return Object.fromEntries(
    [...map.entries()].sort(([left], [right]) => compareKeys(left, right)),
  );
}

export function aggregateMeasurements(
  decisions: readonly TraceMeasurementDecision[],
  policy: MeasurementPolicy,
): MeasurementSummary {
  validateMeasurementPolicy(policy);

  const bindings = new Map<string, BindingAggregate>();
  const confusions = new Map<string, ConfusionAggregate>();
  const transitions = new Map<string, TransitionAggregate>();
  let bindingObservationCount = 0;
  let confusionObservationCount = 0;
  let transitionObservationCount = 0;

  for (const decision of decisions) {
    if (decision.binding.included) {
      bindingObservationCount += 1;
      const observation = decision.binding.observation;
      const key = bindingScopeKey(observation.scope);
      const previous = bindings.get(key) ?? {
        scope: observation.scope,
        attempts: 0,
        errors: 0,
        timingSamples: 0,
        currentTimeToTypeMs: null,
        bestTimeToTypeMs: null,
        timingExclusions: emptyTimingExclusions(),
      };

      const timingSamples = previous.timingSamples
        + (observation.timingMs === null ? 0 : 1);
      const currentTimeToTypeMs = observation.timingMs === null
        ? previous.currentTimeToTypeMs
        : smoothTiming(
            previous.currentTimeToTypeMs,
            observation.timingMs,
            policy.smoothingAlpha,
          );
      const bestTimeToTypeMs = observation.timingMs === null
        ? previous.bestTimeToTypeMs
        : previous.bestTimeToTypeMs === null
          ? observation.timingMs
          : Math.min(previous.bestTimeToTypeMs, observation.timingMs);

      bindings.set(key, {
        scope: previous.scope,
        attempts: previous.attempts + 1,
        errors: previous.errors + (observation.correct ? 0 : 1),
        timingSamples,
        currentTimeToTypeMs,
        bestTimeToTypeMs,
        timingExclusions: incrementTimingExclusion(
          previous.timingExclusions,
          observation.timingExclusionReason,
        ),
      });
    }

    if (decision.confusion.included) {
      confusionObservationCount += 1;
      const observation = decision.confusion.observation;
      const key = confusionScopeKey(observation.scope);
      const previous = confusions.get(key);
      confusions.set(key, {
        scope: observation.scope,
        occurrences: (previous?.occurrences ?? 0) + 1,
      });
    }

    if (decision.transition.included) {
      transitionObservationCount += 1;
      const observation = decision.transition.observation;
      const key = transitionScopeKey(observation.scope);
      const previous = transitions.get(key);
      transitions.set(key, {
        scope: observation.scope,
        timingSamples: (previous?.timingSamples ?? 0) + 1,
        currentTimeToTypeMs: smoothTiming(
          previous?.currentTimeToTypeMs ?? null,
          observation.timingMs,
          policy.smoothingAlpha,
        ),
        bestTimeToTypeMs: previous === undefined
          ? observation.timingMs
          : Math.min(previous.bestTimeToTypeMs, observation.timingMs),
      });
    }
  }

  return {
    policyVersion: policy.version,
    traceCount: decisions.length,
    bindingObservationCount,
    confusionObservationCount,
    transitionObservationCount,
    bindings: sortedRecord(bindings),
    confusions: sortedRecord(confusions),
    transitions: sortedRecord(transitions),
  };
}

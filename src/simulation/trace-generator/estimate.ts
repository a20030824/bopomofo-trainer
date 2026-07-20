import type { Exercise, TimingContext } from "../../core/model.js";
import { aggregateMeasurements } from "../../measurement/aggregate.js";
import { deriveMeasurementDecisions } from "../../measurement/derive-observations.js";
import type { MeasurementPolicy, TraceMeasurementDecision } from "../../measurement/types.js";
import type { InteractionTrace } from "../../practice/interaction-session.js";
import { confusionTruthKey, transitionTruthKey } from "../learner/state.js";
import type {
  EstimationErrorComponent,
  EstimationErrorReport,
  MeasurementEstimate,
  ScalarEstimate,
  SyntheticLearnerState,
} from "../learner/types.js";

function compareKeys(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sortedRecord<T>(entries: readonly (readonly [string, T])[]): Readonly<Record<string, T>> {
  return Object.fromEntries([...entries].sort(([left], [right]) => compareKeys(left, right)));
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function isMotorContext(context: TimingContext, policy: MeasurementPolicy): boolean {
  return policy.motorTimingContexts.includes(context);
}

function bindingEstimates(
  decisions: readonly TraceMeasurementDecision[],
): Readonly<Record<string, ScalarEstimate>> {
  const counts = new Map<string, { attempts: number; errors: number }>();
  for (const decision of decisions) {
    if (!decision.binding.included) continue;
    if (decision.binding.observation.timingExclusionReason === "recovery") continue;
    const tokenId = decision.binding.observation.scope.tokenId;
    const prior = counts.get(tokenId) ?? { attempts: 0, errors: 0 };
    counts.set(tokenId, {
      attempts: prior.attempts + 1,
      errors: prior.errors + (decision.binding.observation.correct ? 0 : 1),
    });
  }
  return sortedRecord(
    [...counts.entries()].map(([relationKey, count]) => [
      relationKey,
      {
        relationKey,
        samples: count.attempts,
        value: count.errors / count.attempts,
        reason: "binding-error-rate-from-phase-3-observations" as const,
      },
    ]),
  );
}

function confusionEstimates(
  decisions: readonly TraceMeasurementDecision[],
  policy: MeasurementPolicy,
): Readonly<Record<string, ScalarEstimate>> {
  const motorErrors = new Map<string, number>();
  const confusionCounts = new Map<string, number>();

  for (const decision of decisions) {
    if (
      decision.binding.included
      && isMotorContext(decision.context, policy)
      && !decision.binding.observation.correct
    ) {
      const expected = decision.binding.observation.scope.tokenId;
      motorErrors.set(expected, (motorErrors.get(expected) ?? 0) + 1);
    }
    if (decision.confusion.included) {
      const scope = decision.confusion.observation.scope;
      const key = confusionTruthKey(scope.expectedToken, scope.actualToken);
      confusionCounts.set(key, (confusionCounts.get(key) ?? 0) + 1);
    }
  }

  const entries: Array<readonly [string, ScalarEstimate]> = [];
  for (const [key, occurrences] of confusionCounts) {
    const parsed = JSON.parse(key) as [string, string];
    const denominator = motorErrors.get(parsed[0]) ?? 0;
    if (denominator === 0) continue;
    entries.push([
      key,
      {
        relationKey: key,
        samples: denominator,
        value: occurrences / denominator,
        reason: "conditional-confusion-rate-from-phase-3-observations",
      },
    ]);
  }
  return sortedRecord(entries);
}

function transitionEstimates(
  decisions: readonly TraceMeasurementDecision[],
): Readonly<Record<string, ScalarEstimate>> {
  const samples = new Map<string, number[]>();
  for (const decision of decisions) {
    if (!decision.transition.included) continue;
    const scope = decision.transition.observation.scope;
    const key = transitionTruthKey(scope.fromToken, scope.toToken);
    const values = samples.get(key) ?? [];
    values.push(decision.transition.observation.timingMs);
    samples.set(key, values);
  }
  return sortedRecord(
    [...samples.entries()].map(([relationKey, values]) => [
      relationKey,
      {
        relationKey,
        samples: values.length,
        value: mean(values),
        reason: "transition-mean-from-phase-3-observations" as const,
      },
    ]),
  );
}

function boundaryEstimates(
  traces: readonly InteractionTrace[],
): Readonly<Record<string, ScalarEstimate>> {
  const samples = new Map<string, number[]>();
  let noiseSinceAdvance = false;
  for (const trace of traces) {
    const boundary = trace.context === "exercise-start"
      || trace.context === "entry-start"
      || trace.context === "syllable-start";
    if (
      boundary
      && trace.outcome === "correct"
      && !trace.recovery
      && !noiseSinceAdvance
    ) {
      const values = samples.get(trace.context) ?? [];
      values.push(trace.elapsedSinceAdvanceMs);
      samples.set(trace.context, values);
    }
    if (trace.advanced) {
      noiseSinceAdvance = false;
    } else if (
      trace.outcome === "unmapped"
      || trace.outcome === "ignored-repeat"
      || trace.outcome === "ignored-modifier"
      || trace.outcome === "composition"
    ) {
      noiseSinceAdvance = true;
    }
  }
  return sortedRecord(
    [...samples.entries()].map(([relationKey, values]) => [
      relationKey,
      {
        relationKey,
        samples: values.length,
        value: mean(values),
        reason: "clean-boundary-mean-from-raw-traces" as const,
      },
    ]),
  );
}

export function estimateMeasurements(
  exercise: Exercise,
  traces: readonly InteractionTrace[],
  policy: MeasurementPolicy,
): MeasurementEstimate {
  const decisions = deriveMeasurementDecisions(exercise, traces, policy);
  return {
    aggregate: aggregateMeasurements(decisions, policy),
    decisions,
    bindingErrorRates: bindingEstimates(decisions),
    conditionalConfusionRates: confusionEstimates(decisions, policy),
    transitionMeanLatencies: transitionEstimates(decisions),
    boundaryMeanLatencies: boundaryEstimates(traces),
    orderingReason: "code-unit-sorted-estimate-keys",
  };
}

function component(
  relationKind: EstimationErrorComponent["relationKind"],
  relationKey: string,
  latentValue: number,
  estimate: ScalarEstimate | undefined,
): EstimationErrorComponent {
  if (estimate === undefined) {
    return {
      relationKind,
      relationKey,
      status: "insufficient-samples",
      latentValue,
      estimatedValue: null,
      absoluteError: null,
      relativeError: null,
      reason: "no-eligible-phase-3-observation",
    };
  }
  const absoluteError = Math.abs(estimate.value - latentValue);
  const relativeError = latentValue === 0
    ? absoluteError === 0 ? 0 : null
    : absoluteError / Math.abs(latentValue);
  return {
    relationKind,
    relationKey,
    status: "estimated",
    latentValue,
    estimatedValue: estimate.value,
    absoluteError,
    relativeError,
    reason: "estimate-available",
  };
}

function meanAbsoluteError(
  components: readonly EstimationErrorComponent[],
  kind: EstimationErrorComponent["relationKind"],
): number | null {
  const values = components
    .filter((candidate) => candidate.relationKind === kind)
    .flatMap((candidate) => candidate.absoluteError === null ? [] : [candidate.absoluteError]);
  return values.length === 0 ? null : mean(values);
}

export function reportEstimationError(
  truth: SyntheticLearnerState,
  estimate: MeasurementEstimate,
): EstimationErrorReport {
  const components: EstimationErrorComponent[] = [];
  for (const key of Object.keys(truth.bindings).sort(compareKeys)) {
    const binding = truth.bindings[key];
    if (binding === undefined) continue;
    components.push(component("binding", key, binding.errorProbability, estimate.bindingErrorRates[key]));
  }
  for (const key of Object.keys(truth.transitions).sort(compareKeys)) {
    const transition = truth.transitions[key];
    if (transition === undefined) continue;
    components.push(component(
      "transition",
      key,
      transition.latency.meanMs,
      estimate.transitionMeanLatencies[key],
    ));
  }
  for (const key of Object.keys(truth.confusions).sort(compareKeys)) {
    const confusion = truth.confusions[key];
    if (confusion === undefined) continue;
    components.push(component(
      "confusion",
      key,
      confusion.conditionalProbability,
      estimate.conditionalConfusionRates[key],
    ));
  }
  return {
    components,
    meanAbsoluteErrorByKind: {
      binding: meanAbsoluteError(components, "binding"),
      confusion: meanAbsoluteError(components, "confusion"),
      transition: meanAbsoluteError(components, "transition"),
    },
    comparisonTruthReason: "traces-generated-from-before-exposure-truth",
  };
}

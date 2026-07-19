import type { Exercise, TimingContext } from "../core/model.js";
import type { InteractionTrace } from "../practice/interaction-session.js";
import { includesContext } from "./policy.js";
import type {
  BindingObservation,
  ConfusionObservation,
  MeasurementPolicy,
  ObservationDecision,
  ObservationExclusionReason,
  TimingExclusionReason,
  TraceMeasurementDecision,
  TransitionObservation,
} from "./types.js";

function excluded<T>(reason: ObservationExclusionReason): ObservationDecision<T> {
  return { included: false, reason };
}

function included<T>(observation: T): ObservationDecision<T> {
  return { included: true, observation };
}

function baseExclusion(trace: InteractionTrace): ObservationExclusionReason | null {
  switch (trace.outcome) {
    case "ignored-repeat":
      return "ignored-repeat";
    case "ignored-modifier":
      return "ignored-modifier";
    case "composition":
      return "composition";
    case "unmapped":
      return "unmapped";
    default:
      return null;
  }
}

function contextExclusion(context: TimingContext): ObservationExclusionReason {
  if (context === "exercise-start") return "exercise-start";
  if (context === "entry-start") return "entry-start";
  return "non-motor-context";
}

function timingDecision(
  trace: InteractionTrace,
  policy: MeasurementPolicy,
): { readonly timingMs: number | null; readonly reason: TimingExclusionReason | null } {
  if (trace.outcome !== "correct") {
    return { timingMs: null, reason: "incorrect" };
  }
  if (trace.recovery) {
    return { timingMs: null, reason: "recovery" };
  }
  if (!includesContext(policy.motorTimingContexts, trace.context)) {
    return { timingMs: null, reason: "syllable-start" };
  }
  return { timingMs: trace.elapsedSinceAdvanceMs, reason: null };
}

function deriveBinding(
  exercise: Exercise,
  trace: InteractionTrace,
  policy: MeasurementPolicy,
): ObservationDecision<BindingObservation> {
  const base = baseExclusion(trace);
  if (base !== null) return excluded(base);

  if (!includesContext(policy.bindingContexts, trace.context)) {
    return excluded(contextExclusion(trace.context));
  }
  if (trace.actualToken === null) return excluded("unmapped");

  const timing = timingDecision(trace, policy);
  return included({
    traceSequence: trace.sequence,
    scope: {
      mode: exercise.mode,
      layoutId: exercise.layoutId,
      tokenId: trace.expectedToken,
    },
    context: trace.context,
    physicalCode: trace.physicalCode,
    correct: trace.outcome === "correct",
    timingMs: timing.timingMs,
    timingExclusionReason: timing.reason,
  });
}

function deriveConfusion(
  exercise: Exercise,
  trace: InteractionTrace,
  policy: MeasurementPolicy,
): ObservationDecision<ConfusionObservation> {
  const base = baseExclusion(trace);
  if (base !== null) return excluded(base);

  if (!includesContext(policy.motorTimingContexts, trace.context)) {
    return excluded(contextExclusion(trace.context));
  }
  if (trace.outcome !== "incorrect") return excluded("not-incorrect");
  if (trace.actualToken === null) return excluded("unmapped");

  return included({
    traceSequence: trace.sequence,
    scope: {
      mode: exercise.mode,
      layoutId: exercise.layoutId,
      expectedToken: trace.expectedToken,
      actualToken: trace.actualToken,
    },
    context: trace.context,
    physicalCode: trace.physicalCode,
  });
}

function deriveTransition(
  exercise: Exercise,
  trace: InteractionTrace,
  policy: MeasurementPolicy,
): ObservationDecision<TransitionObservation> {
  const base = baseExclusion(trace);
  if (base !== null) return excluded(base);

  if (!includesContext(policy.motorTimingContexts, trace.context)) {
    return excluded(contextExclusion(trace.context));
  }
  if (trace.outcome !== "correct") return excluded("not-correct");
  if (trace.recovery) return excluded("recovery");
  if (trace.tokenIndex === 0) return excluded("cross-boundary");
  if (trace.previousToken === null) return excluded("no-previous-token");

  return included({
    traceSequence: trace.sequence,
    scope: {
      mode: exercise.mode,
      layoutId: exercise.layoutId,
      fromToken: trace.previousToken,
      toToken: trace.expectedToken,
    },
    context: trace.context,
    timingMs: trace.elapsedSinceAdvanceMs,
  });
}

export function deriveMeasurementDecisions(
  exercise: Exercise,
  traces: readonly InteractionTrace[],
  policy: MeasurementPolicy,
): readonly TraceMeasurementDecision[] {
  return traces.map((trace) => {
    if (trace.exerciseId !== exercise.id) {
      throw new Error(
        `trace ${trace.sequence} belongs to exercise ${trace.exerciseId}, expected ${exercise.id}`,
      );
    }

    return {
      traceSequence: trace.sequence,
      context: trace.context,
      binding: deriveBinding(exercise, trace, policy),
      confusion: deriveConfusion(exercise, trace, policy),
      transition: deriveTransition(exercise, trace, policy),
    };
  });
}

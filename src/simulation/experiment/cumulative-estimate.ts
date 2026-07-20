import type { MeasurementSummary } from "../../measurement/types.js";
import {
  confusionTruthKey,
  transitionTruthKey,
} from "../learner/state.js";
import type {
  MeasurementEstimate,
  ScalarEstimate,
  SyntheticLearnerState,
} from "../learner/types.js";
import { reportEstimationError } from "../trace-generator/estimate.js";
import type { CumulativeEstimationErrorReport } from "./types.js";

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sortedRecord<T>(entries: readonly (readonly [string, T])[]): Readonly<Record<string, T>> {
  return Object.fromEntries([...entries].sort(([left], [right]) => compareText(left, right)));
}

export function cumulativeMeasurementEstimate(
  summary: MeasurementSummary,
): MeasurementEstimate {
  const bindingErrorRates = sortedRecord(Object.values(summary.bindings)
    .filter((aggregate) => aggregate.attempts > 0)
    .map((aggregate): readonly [string, ScalarEstimate] => [
      aggregate.scope.tokenId,
      {
        relationKey: aggregate.scope.tokenId,
        samples: aggregate.attempts,
        value: aggregate.errors / aggregate.attempts,
        reason: "binding-error-rate-from-phase-3-observations",
      },
    ]));

  const transitionMeanLatencies = sortedRecord(Object.values(summary.transitions)
    .map((aggregate): readonly [string, ScalarEstimate] => {
      const key = transitionTruthKey(
        aggregate.scope.fromToken,
        aggregate.scope.toToken,
      );
      return [key, {
        relationKey: key,
        samples: aggregate.timingSamples,
        value: aggregate.currentTimeToTypeMs,
        reason: "transition-mean-from-phase-3-observations",
      }];
    }));

  const bindingByExpectedToken = new Map(
    Object.values(summary.bindings).map((aggregate) => [
      aggregate.scope.tokenId,
      aggregate,
    ] as const),
  );
  const conditionalConfusionRates = sortedRecord(Object.values(summary.confusions)
    .flatMap((aggregate): readonly (readonly [string, ScalarEstimate])[] => {
      const denominator = bindingByExpectedToken.get(
        aggregate.scope.expectedToken,
      )?.errors ?? 0;
      if (denominator === 0) return [];
      const key = confusionTruthKey(
        aggregate.scope.expectedToken,
        aggregate.scope.actualToken,
      );
      return [[key, {
        relationKey: key,
        samples: denominator,
        value: aggregate.occurrences / denominator,
        reason: "conditional-confusion-rate-from-phase-3-observations",
      }]];
    }));

  return {
    aggregate: summary,
    decisions: [],
    bindingErrorRates,
    conditionalConfusionRates,
    transitionMeanLatencies,
    boundaryMeanLatencies: {},
    orderingReason: "code-unit-sorted-estimate-keys",
  };
}

export function cumulativeEstimationError(
  learnerBefore: SyntheticLearnerState,
  summary: MeasurementSummary,
): CumulativeEstimationErrorReport {
  const report = reportEstimationError(
    learnerBefore,
    cumulativeMeasurementEstimate(summary),
  );
  return {
    components: report.components,
    meanAbsoluteErrorByKind: report.meanAbsoluteErrorByKind,
    comparisonTruthReason:
      "cumulative-phase-3-estimate-versus-current-pre-exposure-truth",
  };
}

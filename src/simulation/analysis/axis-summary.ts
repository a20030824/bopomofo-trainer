import { RELATIONAL_EXPERIMENT_METRIC_KEYS } from "../experiment/report.js";
import { compareExperimentRuns } from "../experiment/run-cell.js";
import type {
  RelationalExperimentReport,
  RelationalExperimentRunRecord,
} from "../experiment/types.js";
import { blockingFallbackRate, totalFallbackRate } from "./fallback-policy.js";
import type {
  AnalysisAxis,
  AnalysisStatistics,
  AxisLevelSummary,
  ExperimentMetricKey,
  RelationalAnalysisPolicy,
} from "./types.js";

const AXES = ["objective", "partition", "composition", "learner"] as const;

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function axisValue(run: RelationalExperimentRunRecord, axis: AnalysisAxis): string {
  if (axis === "objective") return run.cell.objectiveStrategyId;
  if (axis === "partition") return run.cell.partitionPolicyId;
  if (axis === "composition") return run.cell.compositionStrategyId;
  return run.cell.learnerModelId;
}

function statistics(
  runs: readonly RelationalExperimentRunRecord[],
  metric: ExperimentMetricKey,
): AnalysisStatistics {
  const values = runs.flatMap((run) => {
    const value = run.metrics[metric].value;
    return value === null ? [] : [value];
  });
  const missing = runs.length - values.length;
  if (values.length === 0) {
    return {
      samples: 0, missing, mean: null, standardDeviation: null,
      confidence95Low: null, confidence95High: null,
      reason: "no-identifiable-sample",
    };
  }
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (values.length === 1) {
    return {
      samples: 1, missing, mean, standardDeviation: null,
      confidence95Low: null, confidence95High: null,
      reason: "one-identifiable-sample-no-stability-interval",
    };
  }
  const variance = values.reduce(
    (sum, value) => sum + (value - mean) ** 2,
    0,
  ) / (values.length - 1);
  const standardDeviation = Math.sqrt(variance);
  const margin = 1.96 * standardDeviation / Math.sqrt(values.length);
  return {
    samples: values.length, missing, mean, standardDeviation,
    confidence95Low: mean - margin,
    confidence95High: mean + margin,
    reason: "descriptive-normal-interval-across-balanced-runs",
  };
}

interface PendingSummary extends Omit<AxisLevelSummary, "balanced"> {
  readonly groupKey: string;
}

function summariesForScope(
  runs: readonly RelationalExperimentRunRecord[],
  scenarioId: string | "all-scenarios",
  policy: RelationalAnalysisPolicy,
): readonly PendingSummary[] {
  const result: PendingSummary[] = [];
  for (const axis of AXES) {
    const groups = new Map<string, RelationalExperimentRunRecord[]>();
    for (const run of runs) {
      const level = axisValue(run, axis);
      groups.set(level, [...(groups.get(level) ?? []), run]);
    }
    for (const [levelId, group] of groups) {
      const ordered = [...group].sort(compareExperimentRuns);
      const totalRounds = ordered.reduce((sum, run) => sum + run.rounds.length, 0);
      const failureRounds = ordered.reduce((sum, run) => sum + run.failureCount, 0);
      result.push({
        groupKey: JSON.stringify([axis, scenarioId]),
        axis,
        levelId,
        scenarioId,
        cellCount: new Set(ordered.map((run) => run.cell.id)).size,
        runCount: ordered.length,
        fallbackRate: totalFallbackRate(ordered),
        blockingFallbackRate: blockingFallbackRate(ordered, policy),
        failureRate: totalRounds === 0 ? 0 : failureRounds / totalRounds,
        metrics: Object.fromEntries(RELATIONAL_EXPERIMENT_METRIC_KEYS.map((metric) => [
          metric,
          statistics(ordered, metric),
        ])) as AxisLevelSummary["metrics"],
      });
    }
  }
  return result;
}

export function summarizeExperimentAxes(
  report: RelationalExperimentReport,
  policy: RelationalAnalysisPolicy,
): readonly AxisLevelSummary[] {
  const pending: PendingSummary[] = [
    ...summariesForScope(report.runs, "all-scenarios", policy),
    ...[...new Set(report.runs.map((run) => run.scenarioId))]
      .sort(compareText)
      .flatMap((scenarioId) => summariesForScope(
        report.runs.filter((run) => run.scenarioId === scenarioId),
        scenarioId,
        policy,
      )),
  ];
  const balance = new Map<string, boolean>();
  for (const groupKey of new Set(pending.map((item) => item.groupKey))) {
    const group = pending.filter((item) => item.groupKey === groupKey);
    const first = group[0]!;
    balance.set(groupKey, group.every((item) =>
      item.cellCount === first.cellCount && item.runCount === first.runCount
    ));
  }
  return pending.map(({ groupKey, ...item }) => ({
    ...item,
    balanced: balance.get(groupKey) ?? false,
  })).sort((left, right) =>
    compareText(left.scenarioId, right.scenarioId)
      || compareText(left.axis, right.axis)
      || compareText(left.levelId, right.levelId)
  );
}

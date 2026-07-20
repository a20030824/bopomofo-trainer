import { RELATIONAL_EXPERIMENT_METRIC_KEYS } from "../experiment/report.js";
import type {
  RelationalExperimentAggregate,
  RelationalExperimentReport,
  RelationalExperimentRunRecord,
} from "../experiment/types.js";
import type { RelationalStrategyCell } from "../strategy-matrix.js";
import type {
  CellScenarioComparison,
  ExperimentMetricKey,
  MetricComparison,
  RelationalAnalysisPolicy,
} from "./types.js";

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function aggregateKey(cellId: string, scenarioId: string): string {
  return JSON.stringify([cellId, scenarioId]);
}

function cellMap(report: RelationalExperimentReport): ReadonlyMap<string, RelationalStrategyCell> {
  const result = new Map<string, RelationalStrategyCell>();
  for (const run of report.runs) {
    const prior = result.get(run.cell.id);
    if (prior !== undefined && JSON.stringify(prior) !== JSON.stringify(run.cell)) {
      throw new Error(`inconsistent strategy cell definition: ${run.cell.id}`);
    }
    result.set(run.cell.id, run.cell);
  }
  return result;
}

function metricComparison(
  metric: ExperimentMetricKey,
  cell: RelationalExperimentAggregate,
  baseline: RelationalExperimentAggregate,
  policy: RelationalAnalysisPolicy,
): MetricComparison {
  const rule = policy.metrics[metric];
  const cellStats = cell.metrics[metric];
  const baselineStats = baseline.metrics[metric];
  const cellMean = cellStats.mean;
  const baselineMean = baselineStats.mean;
  const absoluteDelta = cellMean === null || baselineMean === null
    ? null
    : cellMean - baselineMean;
  const relativeDelta = absoluteDelta === null || baselineMean === null || baselineMean === 0
    ? null
    : absoluteDelta / Math.abs(baselineMean);

  if (rule.direction === "descriptive-only") {
    return {
      metric, direction: rule.direction, role: rule.role,
      status: "descriptive-only", cellMean, baselineMean,
      absoluteDelta, relativeDelta, improvement: null, relativeImprovement: null,
      materialImprovement: false, materialRegression: false,
      cellSamples: cellStats.samples, cellMissing: cellStats.missing,
      baselineSamples: baselineStats.samples, baselineMissing: baselineStats.missing,
      reason: "metric-is-descriptive-only",
    };
  }

  const status = cellMean === null && baselineMean === null
    ? "both-missing"
    : cellMean === null
      ? "cell-missing"
      : baselineMean === null
        ? "baseline-missing"
        : "identifiable";
  const improvement = absoluteDelta === null
    ? null
    : rule.direction === "lower-is-better" ? -absoluteDelta : absoluteDelta;
  const relativeImprovement = improvement === null || baselineMean === null || baselineMean === 0
    ? null
    : improvement / Math.abs(baselineMean);
  const absolutePass = improvement !== null && improvement >= rule.materialAbsoluteDelta;
  const relativePass = rule.materialRelativeDelta === 0
    || baselineMean === 0
    || (relativeImprovement !== null && relativeImprovement >= rule.materialRelativeDelta);
  const regressionAbsolutePass = improvement !== null
    && -improvement >= rule.materialAbsoluteDelta;
  const regressionRelativePass = rule.materialRelativeDelta === 0
    || baselineMean === 0
    || (relativeImprovement !== null && -relativeImprovement >= rule.materialRelativeDelta);

  return {
    metric, direction: rule.direction, role: rule.role, status,
    cellMean, baselineMean, absoluteDelta, relativeDelta,
    improvement, relativeImprovement,
    materialImprovement: status === "identifiable" && improvement! > 0
      && absolutePass && relativePass,
    materialRegression: status === "identifiable" && improvement! < 0
      && regressionAbsolutePass && regressionRelativePass,
    cellSamples: cellStats.samples, cellMissing: cellStats.missing,
    baselineSamples: baselineStats.samples, baselineMissing: baselineStats.missing,
    reason: status === "identifiable" ? "direction-normalized-baseline-comparison" : status,
  };
}

function classify(
  cellId: string,
  scenarioId: string,
  executableRounds: number,
  fallbackRate: number,
  failureRate: number,
  metrics: readonly MetricComparison[],
  policy: RelationalAnalysisPolicy,
  baselineCellId: string,
): Pick<CellScenarioComparison, "recommendation" | "recommendationReasons"> {
  const reasons: string[] = [];
  let rejected = false;
  if (executableRounds === 0) {
    rejected = true;
    reasons.push("zero-executable-rounds");
  }
  if (failureRate > 0) {
    rejected = true;
    reasons.push("non-zero-failure-rate");
  }
  if (fallbackRate > policy.maximumFallbackRate) {
    rejected = true;
    reasons.push("fallback-rate-above-policy-threshold");
  }
  const protectedRegression = metrics.filter(
    (item) => item.role === "protected" && item.materialRegression,
  );
  if (protectedRegression.length > 0) {
    rejected = true;
    reasons.push(...protectedRegression.map((item) => `protected-regression:${item.metric}`));
  }
  if (rejected) return { recommendation: "rejected", recommendationReasons: reasons.sort(compareText) };
  if (cellId === baselineCellId) {
    return { recommendation: "inconclusive", recommendationReasons: ["baseline-reference-cell"] };
  }
  const primary = policy.scenarioPrimaryMetrics[scenarioId];
  if (primary === undefined || primary.length === 0) {
    return { recommendation: "inconclusive", recommendationReasons: ["scenario-primary-metrics-not-declared"] };
  }
  const primaryComparisons = primary.map((key) => metrics.find((item) => item.metric === key)!);
  const missing = primaryComparisons.filter((item) => item.status !== "identifiable");
  if (missing.length > 0) {
    return {
      recommendation: "inconclusive",
      recommendationReasons: missing.map((item) => `primary-metric-not-identifiable:${item.metric}`).sort(compareText),
    };
  }
  const improved = primaryComparisons.filter((item) => item.materialImprovement);
  if (improved.length === 0) {
    return { recommendation: "inconclusive", recommendationReasons: ["no-material-primary-improvement"] };
  }
  return {
    recommendation: "candidate",
    recommendationReasons: improved.map((item) => `material-improvement:${item.metric}`).sort(compareText),
  };
}

function executionCounts(runs: readonly RelationalExperimentRunRecord[]) {
  const totalRounds = runs.reduce((sum, run) => sum + run.rounds.length, 0);
  const executableRounds = runs.reduce((sum, run) => sum + run.rounds.filter((round) =>
    round.learnerBatch !== null
  ).length, 0);
  return { totalRounds, executableRounds };
}

export function compareExperimentCells(
  report: RelationalExperimentReport,
  baselineCellId: string,
  policy: RelationalAnalysisPolicy,
): readonly CellScenarioComparison[] {
  const cells = cellMap(report);
  const aggregates = new Map(report.aggregates.map((item) => [
    aggregateKey(item.cellId, item.scenarioId), item,
  ] as const));
  const runGroups = new Map<string, RelationalExperimentRunRecord[]>();
  for (const run of report.runs) {
    const key = aggregateKey(run.cell.id, run.scenarioId);
    runGroups.set(key, [...(runGroups.get(key) ?? []), run]);
  }
  const comparisons: CellScenarioComparison[] = [];
  for (const aggregate of report.aggregates) {
    const key = aggregateKey(aggregate.cellId, aggregate.scenarioId);
    const baseline = aggregates.get(aggregateKey(baselineCellId, aggregate.scenarioId));
    if (baseline === undefined) throw new Error(`missing baseline aggregate for ${aggregate.scenarioId}`);
    const cell = cells.get(aggregate.cellId);
    if (cell === undefined) throw new Error(`missing cell definition for ${aggregate.cellId}`);
    const counts = executionCounts(runGroups.get(key) ?? []);
    const metrics = RELATIONAL_EXPERIMENT_METRIC_KEYS.map((metric) =>
      metricComparison(metric, aggregate, baseline, policy)
    );
    const classification = classify(
      aggregate.cellId, aggregate.scenarioId, counts.executableRounds,
      aggregate.fallbackRate, aggregate.failureRate,
      metrics, policy, baselineCellId,
    );
    comparisons.push({
      cellId: aggregate.cellId,
      baselineCellId,
      scenarioId: aggregate.scenarioId,
      axes: {
        objective: cell.objectiveStrategyId,
        partition: cell.partitionPolicyId,
        composition: cell.compositionStrategyId,
        learner: cell.learnerModelId,
      },
      runCount: aggregate.runCount,
      ...counts,
      fallbackRate: aggregate.fallbackRate,
      failureRate: aggregate.failureRate,
      baselineFallbackRate: baseline.fallbackRate,
      baselineFailureRate: baseline.failureRate,
      metrics,
      ...classification,
    });
  }
  return comparisons.sort((left, right) =>
    compareText(left.scenarioId, right.scenarioId) || compareText(left.cellId, right.cellId)
  );
}

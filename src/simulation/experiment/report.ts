import { stableDigest, stableStringify } from "../../composition/stable.js";
import { createRelationalStrategyMatrix } from "../strategy-matrix.js";
import {
  canonicalizeRelationalExperimentPlan,
  relationalExperimentPlanDigest,
} from "./plan.js";
import {
  compareExperimentRuns,
  runRelationalExperimentCell,
} from "./run-cell.js";
import type {
  AggregateMetricStatistics,
  RelationalExperimentAggregate,
  RelationalExperimentMetrics,
  RelationalExperimentPlan,
  RelationalExperimentReport,
  RelationalExperimentRunRecord,
} from "./types.js";

export const RELATIONAL_EXPERIMENT_METRIC_KEYS = [
  "weaknessIdentificationDelayRounds",
  "bindingEstimateMeanAbsoluteError",
  "transitionEstimateMeanAbsoluteErrorMs",
  "confusionEstimateMeanAbsoluteError",
  "targetExposurePerToken",
  "relationCoverage",
  "heldOutTransferProxy",
  "lexicalConcentration",
  "repeatedEntryRate",
  "fallbackRate",
  "failureRate",
  "costPerLatentImprovement",
  "confusionReduction",
] as const satisfies readonly (keyof RelationalExperimentMetrics)[];

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function statistics(
  runs: readonly RelationalExperimentRunRecord[],
  key: keyof RelationalExperimentMetrics,
): AggregateMetricStatistics {
  const values = runs.flatMap((run) => {
    const value = run.metrics[key].value;
    return value === null ? [] : [value];
  });
  const missing = runs.length - values.length;
  if (values.length === 0) {
    return {
      samples: 0,
      missing,
      mean: null,
      standardDeviation: null,
      confidence95Low: null,
      confidence95High: null,
      reason: "no-identifiable-sample",
    };
  }
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (values.length === 1) {
    return {
      samples: 1,
      missing,
      mean,
      standardDeviation: null,
      confidence95Low: null,
      confidence95High: null,
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
    samples: values.length,
    missing,
    mean,
    standardDeviation,
    confidence95Low: mean - margin,
    confidence95High: mean + margin,
    reason: "descriptive-normal-interval-across-seeds-and-cohorts",
  };
}

function aggregateGroup(
  cellId: string,
  scenarioId: string,
  runs: readonly RelationalExperimentRunRecord[],
): RelationalExperimentAggregate {
  const totalRounds = runs.reduce((sum, run) => sum + run.rounds.length, 0);
  const fallbackRounds = runs.reduce((sum, run) => sum + run.fallbackCount, 0);
  const failureRounds = runs.reduce(
    (sum, run) => sum + run.rounds.filter((round) => round.failures.length > 0).length,
    0,
  );
  return {
    cellId,
    scenarioId,
    runCount: runs.length,
    fallbackRate: totalRounds === 0 ? 0 : fallbackRounds / totalRounds,
    failureRate: totalRounds === 0 ? 0 : failureRounds / totalRounds,
    metrics: Object.fromEntries(RELATIONAL_EXPERIMENT_METRIC_KEYS.map((key) => [
      key,
      statistics(runs, key),
    ])) as Readonly<Record<keyof RelationalExperimentMetrics, AggregateMetricStatistics>>,
  };
}

function aggregateRuns(
  runs: readonly RelationalExperimentRunRecord[],
): readonly RelationalExperimentAggregate[] {
  const groups = new Map<string, RelationalExperimentRunRecord[]>();
  for (const run of runs) {
    const key = stableStringify([run.cell.id, run.scenarioId]);
    groups.set(key, [...(groups.get(key) ?? []), run]);
  }
  return [...groups.values()]
    .map((group) => aggregateGroup(
      group[0]!.cell.id,
      group[0]!.scenarioId,
      group,
    ))
    .sort((left, right) => compareText(left.cellId, right.cellId)
      || compareText(left.scenarioId, right.scenarioId));
}

export function runRelationalExperiments(
  inputPlan: RelationalExperimentPlan,
): RelationalExperimentReport {
  const plan = canonicalizeRelationalExperimentPlan(inputPlan);
  const matrix = createRelationalStrategyMatrix(plan.matrixOptions);
  const runs: RelationalExperimentRunRecord[] = [];

  for (const cell of matrix.cells) {
    for (const scenarioId of plan.scenarioIds) {
      for (const seed of plan.seeds) {
        runs.push(runRelationalExperimentCell(plan, cell, scenarioId, seed));
      }
    }
  }
  runs.sort(compareExperimentRuns);

  const body = {
    schemaVersion: "relational-experiment-report-v1" as const,
    planId: plan.id,
    planDigest: relationalExperimentPlanDigest(plan),
    matrixDigest: matrix.determinismDigest,
    runCount: runs.length,
    runs,
    aggregates: aggregateRuns(runs),
    limitations: [
      "Synthetic validity does not establish human learning validity.",
      "Confidence intervals are descriptive normal approximations over identifiable seeded cohort values.",
      "Held-out transfer is null unless the learner model emits explicit transfer events.",
      "Objective selectors observe cumulative Phase 3 measurements and catalog support, never latent learner truth.",
      "Reference-candidate approval, browser presentation, auto-advance, and human pilots remain outside this harness.",
    ] as const,
  };

  return {
    ...body,
    determinismDigest: stableDigest(body),
  };
}

export function serializeRelationalExperimentReport(
  report: RelationalExperimentReport,
): string {
  return `${stableStringify(report)}\n`;
}

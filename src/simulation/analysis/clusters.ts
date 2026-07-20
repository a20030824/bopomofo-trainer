import type {
  RelationalExperimentReport,
  RelationalExperimentRunRecord,
} from "../experiment/types.js";
import type { AnalysisAxis } from "./types.js";
import type { FailureCluster, FallbackCluster } from "./report-types.js";

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

interface ClusterCounter {
  rounds: number;
  runs: Set<string>;
}

function dimensions(run: RelationalExperimentRunRecord): readonly (readonly [
  "global" | "scenario" | "cell" | AnalysisAxis,
  string,
])[] {
  return [
    ["global", "all"],
    ["scenario", run.scenarioId],
    ["cell", run.cell.id],
    ["objective", run.cell.objectiveStrategyId],
    ["partition", run.cell.partitionPolicyId],
    ["composition", run.cell.compositionStrategyId],
    ["learner", run.cell.learnerModelId],
  ];
}

function increment(map: Map<string, ClusterCounter>, key: string, runId: string): void {
  const prior = map.get(key) ?? { rounds: 0, runs: new Set<string>() };
  prior.rounds += 1;
  prior.runs.add(runId);
  map.set(key, prior);
}

export function clusterExperimentFailures(
  report: RelationalExperimentReport,
): readonly FailureCluster[] {
  const counters = new Map<string, ClusterCounter>();
  for (const run of report.runs) {
    for (const round of run.rounds) {
      for (const failure of round.failures) {
        for (const [dimension, dimensionValue] of dimensions(run)) {
          increment(counters, JSON.stringify([
            dimension, dimensionValue, failure.stage, failure.code,
          ]), run.id);
        }
      }
    }
  }
  return [...counters.entries()].map(([key, counter]) => {
    const [dimension, dimensionValue, stage, code] = JSON.parse(key) as [
      FailureCluster["dimension"], string, FailureCluster["stage"], string,
    ];
    return {
      dimension, dimensionValue, stage, code,
      rounds: counter.rounds, runs: counter.runs.size,
    };
  }).sort((left, right) =>
    compareText(left.dimension, right.dimension)
      || compareText(left.dimensionValue, right.dimensionValue)
      || compareText(left.stage, right.stage)
      || compareText(left.code, right.code)
  );
}

export function clusterExperimentFallbacks(
  report: RelationalExperimentReport,
): readonly FallbackCluster[] {
  const counters = new Map<string, ClusterCounter>();
  for (const run of report.runs) {
    for (const round of run.rounds) {
      const events: Array<readonly [FallbackCluster["stage"], string]> = [];
      if (round.objectiveDecision.fallbackReason !== null) {
        events.push(["objective", round.objectiveDecision.fallbackReason]);
      }
      for (const code of round.sequence?.fallbackReasons ?? []) {
        events.push(["composition", code]);
      }
      for (const [stage, code] of events) {
        for (const [dimension, dimensionValue] of dimensions(run)) {
          increment(counters, JSON.stringify([
            dimension, dimensionValue, stage, code,
          ]), run.id);
        }
      }
    }
  }
  return [...counters.entries()].map(([key, counter]) => {
    const [dimension, dimensionValue, stage, code] = JSON.parse(key) as [
      FallbackCluster["dimension"], string, FallbackCluster["stage"], string,
    ];
    return {
      dimension, dimensionValue, stage, code,
      rounds: counter.rounds, runs: counter.runs.size,
    };
  }).sort((left, right) =>
    compareText(left.dimension, right.dimension)
      || compareText(left.dimensionValue, right.dimensionValue)
      || compareText(left.stage, right.stage)
      || compareText(left.code, right.code)
  );
}

import { stableStringify } from "../../composition/stable.js";
import { RELATIONAL_EXPERIMENT_METRIC_KEYS } from "./report.js";
import type { RelationalExperimentReport } from "./types.js";

function csvCell(value: string | number | null): string {
  if (value === null) return "";
  const text = String(value);
  const escaped = text.split('"').join('""');
  return text.includes(",") || text.includes("\n") || text.includes('"')
    ? '"' + escaped + '"'
    : text;
}

export function serializeRelationalExperimentJson(
  report: RelationalExperimentReport,
): string {
  return stableStringify(report) + "\n";
}

export function serializeRelationalExperimentCsv(
  report: RelationalExperimentReport,
): string {
  const rows: string[] = [];
  rows.push([
    "cell_id",
    "scenario_id",
    "run_count",
    "fallback_rate",
    "failure_rate",
    "metric",
    "samples",
    "missing",
    "mean",
    "standard_deviation",
    "confidence_95_low",
    "confidence_95_high",
    "reason",
  ].join(","));

  for (const aggregate of report.aggregates) {
    for (const metric of RELATIONAL_EXPERIMENT_METRIC_KEYS) {
      const stats = aggregate.metrics[metric];
      rows.push([
        aggregate.cellId,
        aggregate.scenarioId,
        aggregate.runCount,
        aggregate.fallbackRate,
        aggregate.failureRate,
        metric,
        stats.samples,
        stats.missing,
        stats.mean,
        stats.standardDeviation,
        stats.confidence95Low,
        stats.confidence95High,
        stats.reason,
      ].map(csvCell).join(","));
    }
  }
  return rows.join("\n") + "\n";
}

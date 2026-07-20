import { stableStringify } from "../../composition/stable.js";
import type { RelationalExperimentAnalysis } from "./report-types.js";

function csvCell(value: string | number | boolean | null): string {
  if (value === null) return "";
  const text = String(value);
  const escaped = text.split('"').join('""');
  return text.includes(",") || text.includes("\n") || text.includes('"')
    ? `"${escaped}"`
    : text;
}

function number(value: number | null): string {
  if (value === null) return "—";
  return Number.isInteger(value) ? String(value) : value.toFixed(4);
}

export function serializeRelationalAnalysisJson(
  analysis: RelationalExperimentAnalysis,
): string {
  return `${stableStringify(analysis)}\n`;
}

export function serializeCellComparisonsCsv(
  analysis: RelationalExperimentAnalysis,
): string {
  const rows: string[] = [[
    "scenario_id", "cell_id", "objective", "partition", "composition", "learner",
    "recommendation", "recommendation_reasons", "run_count", "total_rounds",
    "executable_rounds", "fallback_rate", "blocking_fallback_rate", "failure_rate",
    "baseline_fallback_rate", "baseline_blocking_fallback_rate", "baseline_failure_rate",
    "fallback_delta", "blocking_fallback_delta", "failure_delta",
    "metric", "direction", "role", "status", "cell_mean", "baseline_mean",
    "absolute_delta", "relative_delta", "improvement", "relative_improvement",
    "material_improvement", "material_regression", "cell_samples", "cell_missing",
    "baseline_samples", "baseline_missing",
  ].join(",")];
  for (const comparison of analysis.comparisons) {
    for (const metric of comparison.metrics) {
      rows.push([
        comparison.scenarioId, comparison.cellId,
        comparison.axes.objective, comparison.axes.partition,
        comparison.axes.composition, comparison.axes.learner,
        comparison.recommendation, comparison.recommendationReasons.join(";"),
        comparison.runCount, comparison.totalRounds, comparison.executableRounds,
        comparison.fallbackRate, comparison.blockingFallbackRate, comparison.failureRate,
        comparison.baselineFallbackRate, comparison.baselineBlockingFallbackRate,
        comparison.baselineFailureRate, comparison.fallbackDelta,
        comparison.blockingFallbackDelta, comparison.failureDelta,
        metric.metric, metric.direction, metric.role, metric.status,
        metric.cellMean, metric.baselineMean, metric.absoluteDelta, metric.relativeDelta,
        metric.improvement, metric.relativeImprovement,
        metric.materialImprovement, metric.materialRegression,
        metric.cellSamples, metric.cellMissing,
        metric.baselineSamples, metric.baselineMissing,
      ].map(csvCell).join(","));
    }
  }
  return `${rows.join("\n")}\n`;
}

export function serializeAxisSummariesCsv(
  analysis: RelationalExperimentAnalysis,
): string {
  const rows: string[] = [[
    "scenario_id", "axis", "level_id", "balanced", "cell_count", "run_count",
    "fallback_rate", "blocking_fallback_rate", "failure_rate", "metric", "samples",
    "missing", "mean", "standard_deviation", "confidence_95_low",
    "confidence_95_high", "reason",
  ].join(",")];
  for (const summary of analysis.axisSummaries) {
    for (const [metric, stats] of Object.entries(summary.metrics)) {
      rows.push([
        summary.scenarioId, summary.axis, summary.levelId, summary.balanced,
        summary.cellCount, summary.runCount, summary.fallbackRate,
        summary.blockingFallbackRate, summary.failureRate,
        metric, stats.samples, stats.missing, stats.mean, stats.standardDeviation,
        stats.confidence95Low, stats.confidence95High, stats.reason,
      ].map(csvCell).join(","));
    }
  }
  return `${rows.join("\n")}\n`;
}

function recommendationByScenario(analysis: RelationalExperimentAnalysis): string[] {
  const scenarios = [...new Set(analysis.comparisons.map((item) => item.scenarioId))].sort();
  return scenarios.map((scenarioId) => {
    const items = analysis.comparisons.filter((item) => item.scenarioId === scenarioId);
    const count = (status: "candidate" | "inconclusive" | "rejected") =>
      items.filter((item) => item.recommendation === status).length;
    return `| ${scenarioId} | ${count("candidate")} | ${count("inconclusive")} | ${count("rejected")} |`;
  });
}

function candidateLines(analysis: RelationalExperimentAnalysis): string[] {
  const candidates = analysis.comparisons.filter((item) => item.recommendation === "candidate");
  if (candidates.length === 0) return ["No cell satisfies the versioned candidate guardrails."];
  return candidates.map((item) =>
    `- **${item.scenarioId}** — \`${item.axes.objective}\` / \`${item.axes.partition}\` / `
    + `\`${item.axes.composition}\` / \`${item.axes.learner}\`; `
    + `blocking fallback ${number(item.blockingFallbackRate)}; `
    + item.recommendationReasons.join(", ")
  );
}

function globalClusterLines(
  analysis: RelationalExperimentAnalysis,
  kind: "failure" | "fallback",
): string[] {
  const source = kind === "failure" ? analysis.failureClusters : analysis.fallbackClusters;
  const clusters = source
    .filter((item) => item.dimension === "global")
    .sort((left, right) => right.rounds - left.rounds
      || left.stage.localeCompare(right.stage)
      || left.code.localeCompare(right.code));
  if (clusters.length === 0) return [`No ${kind} cluster was recorded.`];
  return clusters.map((item) =>
    `- \`${item.stage}:${item.code}\` — ${item.rounds} rounds across ${item.runs} runs.`
  );
}

function axisOverview(analysis: RelationalExperimentAnalysis): string[] {
  const summaries = analysis.axisSummaries.filter((item) => item.scenarioId === "all-scenarios");
  return summaries.map((item) =>
    `| ${item.axis} | \`${item.levelId}\` | ${item.balanced ? "yes" : "no"}`
    + ` | ${number(item.fallbackRate)} | ${number(item.blockingFallbackRate)}`
    + ` | ${number(item.failureRate)}`
    + ` | ${number(item.metrics.weaknessIdentificationDelayRounds.mean)}`
    + ` | ${number(item.metrics.relationCoverage.mean)}`
    + ` | ${number(item.metrics.costPerLatentImprovement.mean)} |`
  );
}

export function serializeRelationalAnalysisMarkdown(
  analysis: RelationalExperimentAnalysis,
): string {
  const zeroExecutable = analysis.comparisons.filter((item) => item.executableRounds === 0);
  const lines = [
    "# Relational strategy findings",
    "",
    `- Source plan: \`${analysis.sourcePlanId}\``,
    `- Source report digest: \`${analysis.sourceReportDigest}\``,
    `- Analysis policy: \`${analysis.policy.version}\``,
    `- Analysis digest: \`${analysis.determinismDigest}\``,
    `- Baseline cell: \`${analysis.baselineCellId}\``,
    `- Maximum blocking fallback rate: ${number(analysis.policy.maximumBlockingFallbackRate)}`,
    "",
    "Bootstrap objective fallbacks remain in the raw fallback totals and clusters, but the versioned policy does not treat the declared round-zero codes as blocking candidate evidence.",
    "",
    "## Recommendation counts",
    "",
    `- Candidate: ${analysis.recommendationCounts.candidate}`,
    `- Inconclusive: ${analysis.recommendationCounts.inconclusive}`,
    `- Rejected: ${analysis.recommendationCounts.rejected}`,
    `- Zero executable rounds: ${zeroExecutable.length}`,
    "",
    "| Scenario | Candidate | Inconclusive | Rejected |",
    "|---|---:|---:|---:|",
    ...recommendationByScenario(analysis),
    "",
    "## Candidate cells",
    "",
    ...candidateLines(analysis),
    "",
    "## Global failure clusters",
    "",
    ...globalClusterLines(analysis, "failure"),
    "",
    "## Global fallback clusters",
    "",
    ...globalClusterLines(analysis, "fallback"),
    "",
    "## Balanced axis overview",
    "",
    "| Axis | Level | Balanced | Total fallback | Blocking fallback | Failure | Weakness delay | Coverage | Cost/improvement |",
    "|---|---|---|---:|---:|---:|---:|---:|---:|",
    ...axisOverview(analysis),
    "",
    "## Interpretation boundary",
    "",
    ...analysis.limitations.map((item) => `- ${item}`),
  ];
  return `${lines.join("\n")}\n`;
}

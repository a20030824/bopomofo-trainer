import { stableDigest } from "../../composition/stable.js";
import { createRelationalStrategyMatrix } from "../strategy-matrix.js";
import type { RelationalExperimentReport } from "../experiment/types.js";
import { summarizeExperimentAxes } from "./axis-summary.js";
import { clusterExperimentFailures, clusterExperimentFallbacks } from "./clusters.js";
import { compareExperimentCells } from "./compare.js";
import { RELATIONAL_ANALYSIS_POLICY } from "./policy.js";
import type { RelationalExperimentAnalysis } from "./report-types.js";
import type {
  ExperimentMetricKey,
  RelationalAnalysisPolicy,
  RecommendationStatus,
} from "./types.js";

function validatePolicy(policy: RelationalAnalysisPolicy): void {
  if (policy.schemaVersion !== "relational-analysis-policy-v1") {
    throw new Error(`unsupported analysis policy schema: ${policy.schemaVersion}`);
  }
  if (policy.version.trim().length === 0) throw new Error("analysis policy version is required");
  if (!Number.isFinite(policy.maximumBlockingFallbackRate)
    || policy.maximumBlockingFallbackRate < 0
    || policy.maximumBlockingFallbackRate > 1) {
    throw new RangeError("maximumBlockingFallbackRate must be between zero and one");
  }
  const normalizedFallbackCodes = policy.nonBlockingObjectiveFallbackCodes.map((code) => code.trim());
  if (normalizedFallbackCodes.some((code) => code.length === 0)) {
    throw new Error("nonBlockingObjectiveFallbackCodes must not contain empty codes");
  }
  if (new Set(normalizedFallbackCodes).size !== normalizedFallbackCodes.length) {
    throw new Error("nonBlockingObjectiveFallbackCodes must not contain duplicates");
  }
  for (const [metric, rule] of Object.entries(policy.metrics) as Array<[
    ExperimentMetricKey,
    RelationalAnalysisPolicy["metrics"][ExperimentMetricKey],
  ]>) {
    if (!Number.isFinite(rule.materialAbsoluteDelta) || rule.materialAbsoluteDelta < 0) {
      throw new RangeError(`${metric} materialAbsoluteDelta must be finite and non-negative`);
    }
    if (!Number.isFinite(rule.materialRelativeDelta) || rule.materialRelativeDelta < 0) {
      throw new RangeError(`${metric} materialRelativeDelta must be finite and non-negative`);
    }
  }
}

export function analyzeRelationalExperiments(
  report: RelationalExperimentReport,
  policy: RelationalAnalysisPolicy = RELATIONAL_ANALYSIS_POLICY,
): RelationalExperimentAnalysis {
  validatePolicy(policy);
  const baselineCellId = createRelationalStrategyMatrix().baselineCellId;
  if (!report.runs.some((run) => run.cell.id === baselineCellId)) {
    throw new Error("source report does not contain the matrix-declared baseline cell");
  }
  const comparisons = compareExperimentCells(report, baselineCellId, policy);
  const axisSummaries = summarizeExperimentAxes(report, policy);
  const failureClusters = clusterExperimentFailures(report);
  const fallbackClusters = clusterExperimentFallbacks(report);
  const recommendationCounts: Record<RecommendationStatus, number> = {
    candidate: 0,
    inconclusive: 0,
    rejected: 0,
  };
  for (const comparison of comparisons) {
    recommendationCounts[comparison.recommendation] += 1;
  }
  const body = {
    schemaVersion: "relational-experiment-analysis-v1" as const,
    sourcePlanId: report.planId,
    sourceReportDigest: report.determinismDigest,
    matrixDigest: report.matrixDigest,
    baselineCellId,
    policy,
    comparisons,
    axisSummaries,
    failureClusters,
    fallbackClusters,
    recommendationCounts,
    limitations: [
      "Synthetic strategy comparisons do not establish human learning effectiveness.",
      "Candidate means policy-compatible for this committed cohort, not a production recommendation.",
      "Axis summaries are descriptive factorial averages and are not causal effect estimates.",
      "All fallback rounds remain visible; only versioned round-zero bootstrap codes are non-blocking for candidate guardrails.",
      "Null metrics and failed runs remain visible and are never dropped from guardrails.",
      "Descriptive normal intervals are not inferential evidence for a human population.",
    ] as const,
  };
  return {
    ...body,
    determinismDigest: stableDigest(body),
  };
}

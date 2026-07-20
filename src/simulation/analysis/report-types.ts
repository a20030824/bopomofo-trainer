import type {
  AnalysisAxis,
  AxisLevelSummary,
  CellScenarioComparison,
  RecommendationStatus,
  RelationalAnalysisPolicy,
} from "./types.js";

export interface FailureCluster {
  readonly dimension: "global" | "scenario" | "cell" | AnalysisAxis;
  readonly dimensionValue: string;
  readonly stage: "partition" | "objective" | "composition" | "learner";
  readonly code: string;
  readonly rounds: number;
  readonly runs: number;
}

export interface FallbackCluster {
  readonly dimension: "global" | "scenario" | "cell" | AnalysisAxis;
  readonly dimensionValue: string;
  readonly stage: "objective" | "composition";
  readonly code: string;
  readonly rounds: number;
  readonly runs: number;
}

export interface RelationalExperimentAnalysis {
  readonly schemaVersion: "relational-experiment-analysis-v1";
  readonly sourcePlanId: string;
  readonly sourceReportDigest: string;
  readonly matrixDigest: string;
  readonly baselineCellId: string;
  readonly policy: RelationalAnalysisPolicy;
  readonly comparisons: readonly CellScenarioComparison[];
  readonly axisSummaries: readonly AxisLevelSummary[];
  readonly failureClusters: readonly FailureCluster[];
  readonly fallbackClusters: readonly FallbackCluster[];
  readonly recommendationCounts: Readonly<Record<RecommendationStatus, number>>;
  readonly limitations: readonly string[];
  readonly determinismDigest: string;
}

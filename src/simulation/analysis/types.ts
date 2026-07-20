import type { RelationalExperimentMetrics } from "../experiment/types.js";

export type ExperimentMetricKey = keyof RelationalExperimentMetrics;
export type MetricDirection = "lower-is-better" | "higher-is-better" | "descriptive-only";
export type MetricRole = "primary" | "protected" | "descriptive";
export type RecommendationStatus = "candidate" | "inconclusive" | "rejected";
export type AnalysisAxis = "objective" | "partition" | "composition" | "learner";

export interface MetricAnalysisPolicy {
  readonly direction: MetricDirection;
  readonly role: MetricRole;
  readonly materialAbsoluteDelta: number;
  readonly materialRelativeDelta: number;
}

export interface RelationalAnalysisPolicy {
  readonly schemaVersion: "relational-analysis-policy-v1";
  readonly version: string;
  readonly maximumFallbackRate: number;
  readonly metrics: Readonly<Record<ExperimentMetricKey, MetricAnalysisPolicy>>;
  readonly scenarioPrimaryMetrics: Readonly<Record<string, readonly ExperimentMetricKey[]>>;
}

export interface MetricComparison {
  readonly metric: ExperimentMetricKey;
  readonly direction: MetricDirection;
  readonly role: MetricRole;
  readonly status: "identifiable" | "cell-missing" | "baseline-missing" | "both-missing" | "descriptive-only";
  readonly cellMean: number | null;
  readonly baselineMean: number | null;
  readonly absoluteDelta: number | null;
  readonly relativeDelta: number | null;
  readonly improvement: number | null;
  readonly relativeImprovement: number | null;
  readonly materialImprovement: boolean;
  readonly materialRegression: boolean;
  readonly cellSamples: number;
  readonly cellMissing: number;
  readonly baselineSamples: number;
  readonly baselineMissing: number;
  readonly reason: string;
}

export interface CellScenarioComparison {
  readonly cellId: string;
  readonly baselineCellId: string;
  readonly scenarioId: string;
  readonly axes: Readonly<Record<AnalysisAxis, string>>;
  readonly runCount: number;
  readonly fallbackRate: number;
  readonly failureRate: number;
  readonly baselineFallbackRate: number;
  readonly baselineFailureRate: number;
  readonly metrics: readonly MetricComparison[];
  readonly recommendation: RecommendationStatus;
  readonly recommendationReasons: readonly string[];
}

export interface AnalysisStatistics {
  readonly samples: number;
  readonly missing: number;
  readonly mean: number | null;
  readonly standardDeviation: number | null;
  readonly confidence95Low: number | null;
  readonly confidence95High: number | null;
  readonly reason: string;
}

export interface AxisLevelSummary {
  readonly axis: AnalysisAxis;
  readonly levelId: string;
  readonly scenarioId: string | "all-scenarios";
  readonly balanced: boolean;
  readonly cellCount: number;
  readonly runCount: number;
  readonly fallbackRate: number;
  readonly failureRate: number;
  readonly metrics: Readonly<Record<ExperimentMetricKey, AnalysisStatistics>>;
}

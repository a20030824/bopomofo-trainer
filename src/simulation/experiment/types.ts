import type { CatalogEntry } from "../../core/model.js";
import type { PracticeBudget, PracticeSequence } from "../../composition/types.js";
import type { ObjectiveDecision, RelationObjective } from "../../curriculum/objectives.js";
import type { MeasurementSummary } from "../../measurement/types.js";
import type { RelationalCatalogReport } from "../../relations/catalog-report.js";
import type { PartitionDecision, PartitionPolicyOptions } from "../../relations/partition/types.js";
import type { ConfusionRelationRef } from "../../relations/types.js";
import type {
  EstimationErrorReport,
  SyntheticLearnerState,
  SyntheticTraceBatch,
} from "../learner/types.js";
import type {
  RelationalStrategyCell,
  RelationalStrategyMatrixOptions,
} from "../strategy-matrix.js";

export interface RelationalExperimentPlan {
  readonly schemaVersion: "relational-experiment-plan-v1";
  readonly id: string;
  readonly catalog: readonly CatalogEntry[];
  readonly confusionRelations: readonly ConfusionRelationRef[];
  readonly matrixOptions?: RelationalStrategyMatrixOptions;
  readonly scenarioIds: readonly string[];
  readonly seeds: readonly number[];
  readonly rounds: number;
  readonly partitionOptions: PartitionPolicyOptions;
  readonly frequencyAllowCrossBandFallback: boolean;
  readonly practiceBudget: PracticeBudget;
  readonly beamWidth: number;
  readonly startTimestampMs: number;
  readonly roundTimestampStepMs: number;
}

export interface ExperimentMetricValue {
  readonly value: number | null;
  readonly reason: string;
}

export interface RelationalExperimentMetrics {
  readonly weaknessIdentificationDelayRounds: ExperimentMetricValue;
  readonly bindingEstimateMeanAbsoluteError: ExperimentMetricValue;
  readonly transitionEstimateMeanAbsoluteErrorMs: ExperimentMetricValue;
  readonly confusionEstimateMeanAbsoluteError: ExperimentMetricValue;
  readonly targetExposurePerToken: ExperimentMetricValue;
  readonly relationCoverage: ExperimentMetricValue;
  readonly heldOutTransferProxy: ExperimentMetricValue;
  readonly lexicalConcentration: ExperimentMetricValue;
  readonly repeatedEntryRate: ExperimentMetricValue;
  readonly fallbackRate: ExperimentMetricValue;
  readonly failureRate: ExperimentMetricValue;
  readonly costPerLatentImprovement: ExperimentMetricValue;
  readonly confusionReduction: ExperimentMetricValue;
}

export interface RelationalExperimentFailure {
  readonly round: number;
  readonly stage: "partition" | "objective" | "composition" | "learner";
  readonly code: string;
  readonly detail: string;
}

export interface RelationalExperimentRoundRecord {
  readonly round: number;
  readonly objectiveDecision: ObjectiveDecision;
  readonly objectiveRelationKeys: readonly string[];
  readonly sequence: PracticeSequence | null;
  readonly learnerBatch: SyntheticTraceBatch | null;
  readonly cumulativeMeasurement: MeasurementSummary;
  readonly cumulativeEstimationError: EstimationErrorReport;
  readonly learnerBefore: SyntheticLearnerState;
  readonly learnerAfter: SyntheticLearnerState;
  readonly failures: readonly RelationalExperimentFailure[];
}

export interface RelationalExperimentRunRecord {
  readonly id: string;
  readonly cell: RelationalStrategyCell;
  readonly scenarioId: string;
  readonly seed: number;
  readonly partitionDecision: PartitionDecision | null;
  readonly relationReport: RelationalCatalogReport;
  readonly hiddenWeaknessRelationKeys: readonly string[];
  readonly rounds: readonly RelationalExperimentRoundRecord[];
  readonly finalMeasurement: MeasurementSummary;
  readonly finalLearner: SyntheticLearnerState;
  readonly metrics: RelationalExperimentMetrics;
  readonly fallbackCount: number;
  readonly failureCount: number;
  readonly determinismDigest: string;
}

export interface AggregateMetricStatistics {
  readonly samples: number;
  readonly missing: number;
  readonly mean: number | null;
  readonly standardDeviation: number | null;
  readonly confidence95Low: number | null;
  readonly confidence95High: number | null;
  readonly reason: string;
}

export interface RelationalExperimentAggregate {
  readonly cellId: string;
  readonly scenarioId: string;
  readonly runCount: number;
  readonly fallbackRate: number;
  readonly failureRate: number;
  readonly metrics: Readonly<Record<keyof RelationalExperimentMetrics, AggregateMetricStatistics>>;
}

export interface RelationalExperimentReport {
  readonly schemaVersion: "relational-experiment-report-v1";
  readonly planId: string;
  readonly planDigest: string;
  readonly matrixDigest: string;
  readonly runCount: number;
  readonly runs: readonly RelationalExperimentRunRecord[];
  readonly aggregates: readonly RelationalExperimentAggregate[];
  readonly limitations: readonly string[];
  readonly determinismDigest: string;
}

export interface RelationalExperimentRuntime {
  readonly objective: RelationObjective;
  readonly sequence: PracticeSequence | null;
}

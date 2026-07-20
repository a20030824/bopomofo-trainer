import type { CatalogEntry } from "../../core/model.js";
import type { PracticeBudget } from "../../composition/types.js";
import type { ObjectiveStrategyId } from "../../curriculum/objectives.js";
import type { PartitionPolicyId, PartitionPolicyOptions } from "../../relations/partition/types.js";
import type { ConfusionRelationRef } from "../../relations/types.js";
import type { CompositionStrategyId } from "../../composition/types.js";
import type {
  RelationalLearnerModelId,
  RelationalStrategyCell,
} from "../strategy-matrix.js";
import type { RelationalExperimentMetrics } from "../experiment/types.js";

export type ConfirmationCellRole =
  | "historical-baseline"
  | "phase-7g-candidate"
  | "composer-ablation"
  | "transition-diagnostic";

export type ConfirmationDecision =
  | "survives-confirmation"
  | "scenario-limited"
  | "inconclusive"
  | "rejected";

export interface ConfirmationCellDeclaration {
  readonly objectiveStrategyId: ObjectiveStrategyId;
  readonly partitionPolicyId: PartitionPolicyId;
  readonly compositionStrategyId: CompositionStrategyId;
  readonly learnerModelId: RelationalLearnerModelId;
  readonly role: ConfirmationCellRole;
  readonly hypothesisId: string;
  readonly rationale: string;
  readonly matchedReferenceCellId: string | null;
}

export interface CanonicalConfirmationCellDeclaration
  extends ConfirmationCellDeclaration {
  readonly cell: RelationalStrategyCell;
}

export interface RelationalConfirmationPlan {
  readonly schemaVersion: "relational-confirmation-plan-v1";
  readonly id: string;
  readonly sourceFindingsPolicyVersion: string;
  readonly catalog: readonly CatalogEntry[];
  readonly confusionRelations: readonly ConfusionRelationRef[];
  readonly cells: readonly ConfirmationCellDeclaration[];
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

export interface CanonicalRelationalConfirmationPlan
  extends Omit<RelationalConfirmationPlan, "cells"> {
  readonly cells: readonly CanonicalConfirmationCellDeclaration[];
  readonly baselineCellId: string;
}

export interface ConfirmationRoundTrajectory {
  readonly round: number;
  readonly objectiveRelationKeys: readonly string[];
  readonly selectedEntryIds: readonly string[];
  readonly tokenCount: number;
  readonly syllableCount: number;
  readonly stopReason: string | null;
  readonly totalFallbackCodes: readonly string[];
  readonly blockingFallbackCodes: readonly string[];
  readonly failureCodes: readonly string[];
  readonly hiddenWeaknessHit: boolean;
  readonly bindingEstimateMeanAbsoluteError: number | null;
  readonly transitionEstimateMeanAbsoluteErrorMs: number | null;
  readonly confusionEstimateMeanAbsoluteError: number | null;
}

export interface ConfirmationRunSummary {
  readonly id: string;
  readonly cell: RelationalStrategyCell;
  readonly role: ConfirmationCellRole;
  readonly hypothesisId: string;
  readonly matchedReferenceCellId: string | null;
  readonly scenarioId: string;
  readonly seed: number;
  readonly evaluationEntryIds: readonly string[];
  readonly trajectories: readonly ConfirmationRoundTrajectory[];
  readonly finalMetrics: RelationalExperimentMetrics;
  readonly executableRoundCount: number;
  readonly totalFallbackCount: number;
  readonly blockingFallbackCount: number;
  readonly failureCount: number;
  readonly determinismDigest: string;
}

export interface ConfirmationSurvivalRecord {
  readonly cellId: string;
  readonly scenarioId: string;
  readonly role: ConfirmationCellRole;
  readonly hypothesisId: string;
  readonly seedCount: number;
  readonly runCount: number;
  readonly decision: ConfirmationDecision;
  readonly reasons: readonly string[];
}

export interface RelationalConfirmationReport {
  readonly schemaVersion: "relational-confirmation-report-v1";
  readonly planId: string;
  readonly planDigest: string;
  readonly sourceFindingsPolicyVersion: string;
  readonly baselineCellId: string;
  readonly runCount: number;
  readonly roundCount: number;
  readonly runs: readonly ConfirmationRunSummary[];
  readonly survival: readonly ConfirmationSurvivalRecord[];
  readonly limitations: readonly string[];
  readonly determinismDigest: string;
}

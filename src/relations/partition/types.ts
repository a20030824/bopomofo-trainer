import type { CatalogEntry } from "../../core/model.js";
import type { RelationalCatalogReport } from "../catalog-report.js";

export type PartitionPolicyId =
  | "binding-preserving-baseline-v1"
  | "relation-support-preserving-v1"
  | "frequency-stratified-v1"
  | "seeded-maximum-coverage-v1"
  | "path-novelty-v1";

export interface PartitionInput {
  readonly entries: readonly CatalogEntry[];
  readonly report: RelationalCatalogReport;
}

export interface PartitionPolicyOptions {
  readonly evaluationEntryCount: number;
  readonly minimumTrainingDistinctEntries: number;
}

export interface FrequencyStratifiedOptions extends PartitionPolicyOptions {
  readonly allowCrossBandFallback: boolean;
}

export type PartitionConstraintKind = "hard" | "soft" | "diagnostic";
export type PartitionConstraintStatus = "satisfied" | "unsatisfied";

export interface PartitionConstraintResult {
  readonly id: string;
  readonly kind: PartitionConstraintKind;
  readonly status: PartitionConstraintStatus;
  readonly reasonCode: string;
  readonly actual: number;
  readonly expectedOperator: "equal" | "at-least" | "at-most";
  readonly expected: number;
  readonly relatedEntryIds: readonly string[];
  readonly relatedRelationKeys: readonly string[];
}

export type PartitionTraceAction =
  | "selected"
  | "rejected"
  | "fallback"
  | "stopped";

export interface PartitionSelectionTrace {
  readonly step: number;
  readonly candidateEntryId: string | null;
  readonly action: PartitionTraceAction;
  readonly reasonCode: string;
  readonly evaluationCountBefore: number;
  readonly evaluationCountAfter: number;
  readonly scoreComponents: Readonly<Record<string, number | string>>;
  readonly violatedConstraintIds: readonly string[];
  readonly relatedRelationKeys: readonly string[];
  readonly seedTieBreak: number | null;
}

export interface PartitionFallbackReason {
  readonly code: string;
  readonly constraintId: string;
  readonly message: string;
  readonly relatedEntryIds: readonly string[];
  readonly relatedRelationKeys: readonly string[];
}

export interface RelationPartitionCoverageMetrics {
  readonly observedRelationCount: number;
  readonly trainingCoveredRelationCount: number;
  readonly evaluationCoveredRelationCount: number;
  readonly evaluationOnlyRelationCount: number;
  readonly evaluationOnlyRelationKeys: readonly string[];
}

export interface TrainingSupportMetrics {
  readonly minimumDistinctEntrySupport: number;
  readonly medianDistinctEntrySupport: number;
}

export interface RelationConcentrationMetrics {
  readonly meanTrainingOccurrenceConcentration: number;
  readonly maximumTrainingOccurrenceConcentration: number;
}

export interface PartitionMetrics {
  readonly trainingEntryCount: number;
  readonly evaluationEntryCount: number;
  readonly bindingCoverage: RelationPartitionCoverageMetrics;
  readonly transitionCoverage: RelationPartitionCoverageMetrics;
  readonly evaluationOnlyRelationCount: number;
  readonly unsupportedAfterPartitionCount: number;
  readonly trainingDistinctEntrySupport: TrainingSupportMetrics;
  readonly relationConcentration: RelationConcentrationMetrics;
  readonly frequencyBandDivergence: number;
  readonly tokenOverlap: number;
  readonly transitionOverlap: number;
  readonly lexicalCharacterOverlap: number;
  readonly tagOverlap: number;
  readonly evaluationNovelty: number;
  readonly unsatisfiedConstraintIds: readonly string[];
  readonly determinismDigest: string;
}

export interface PartitionDecision {
  readonly trainingEntryIds: readonly string[];
  readonly evaluationEntryIds: readonly string[];
  readonly policyId: PartitionPolicyId;
  readonly seed: number | null;
  readonly metrics: PartitionMetrics;
  readonly constraintResults: readonly PartitionConstraintResult[];
  readonly selectionTrace: readonly PartitionSelectionTrace[];
  readonly fallbackReasons: readonly PartitionFallbackReason[];
}

export interface PartitionSelectionRate {
  readonly entryId: string;
  readonly selectedCount: number;
  readonly selectionRate: number;
}

export interface PartitionStabilityReport {
  readonly policyId: PartitionPolicyId;
  readonly seeds: readonly number[];
  readonly decisionCount: number;
  readonly meanPairwiseEvaluationJaccard: number;
  readonly minimumPairwiseEvaluationJaccard: number;
  readonly uniqueEvaluationSets: number;
  readonly selectionRates: readonly PartitionSelectionRate[];
  readonly decisionDigests: readonly string[];
  readonly determinismDigest: string;
}

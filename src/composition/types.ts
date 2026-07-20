import type {
  CatalogEntry,
  PracticeMode,
  RandomSource,
} from "../core/model.js";
import type {
  RelationObjective,
} from "../curriculum/objectives.js";
import type {
  RelationOccurrence,
  RelationRef,
} from "../relations/types.js";
import type { CatalogRelationIndex } from "../relations/types.js";

export interface ExposureBudget {
  readonly minimum: number;
  readonly preferred: number;
  readonly maximum: number;
}

export interface PracticeBudget {
  readonly targetExposures: ExposureBudget;
  readonly maximumTokens: number;
  readonly maximumSyllables: number;
  readonly maximumLexicalBoundaries: number;
  readonly minimumCommonWordShare: number;
  readonly maximumSameEntryRepetition: number;
  readonly maximumRelationConcentration: number;
  readonly recentEntryPenalty: number;
  readonly recentTokenPathPenalty: number;
  readonly marginalGainThreshold: number;
}

export interface RecentSequenceHistory {
  readonly entryIds: readonly string[];
  readonly tokenPathSignatures: readonly string[];
}

export type CompositionStrategyId =
  | "fixed-six-baseline"
  | "greedy-marginal-gain"
  | "greedy-gain-per-token"
  | "diversity-aware-greedy"
  | "bounded-beam-search";

export interface CompositionPolicy {
  readonly strategy: CompositionStrategyId;
  readonly beamWidth: number;
}

export interface CompositionInput {
  readonly objective: RelationObjective;
  readonly relationIndex: CatalogRelationIndex;
  readonly entries: readonly CatalogEntry[];
  readonly history: RecentSequenceHistory;
  readonly budget: PracticeBudget;
  readonly policy: CompositionPolicy;
  readonly random: RandomSource;
}

export type ContrastRole = "expected" | "actual";

export interface ConfusionContrastRequirement {
  readonly kind: "confusion-contrast";
  readonly relation: Extract<RelationRef, { readonly kind: "confusion" }>;
  readonly entryId: string;
  readonly role: ContrastRole;
}

export interface TargetEvidence {
  readonly targetKey: string;
  readonly relation: RelationRef;
  readonly exactOccurrences: readonly RelationOccurrence[];
  readonly contrastRequirements: readonly ConfusionContrastRequirement[];
  readonly exposureCount: number;
}

export type RetrievalExclusionReason =
  | "no-exact-support"
  | "evaluation-partition"
  | "missing-catalog-entry"
  | "invalid-index-occurrence"
  | "duplicate-index-occurrence"
  | "confusion-pool-missing"
  | "coverage-objective-requires-explicit-demands"
  | "inconsistent-objective-scope";

export interface RetrievalExclusion {
  readonly entryId: string | null;
  readonly targetKey: string | null;
  readonly reason: RetrievalExclusionReason;
  readonly detail: string;
}

export interface RetrievalCandidate {
  readonly entry: CatalogEntry;
  readonly targetEvidence: readonly TargetEvidence[];
  readonly tokenCount: number;
  readonly syllableCount: number;
  readonly tokenPathSignature: string;
  readonly commonWord: boolean;
}

export interface RetrievalTrace {
  readonly candidateEntryIds: readonly string[];
  readonly exclusions: readonly RetrievalExclusion[];
}

export type CandidateRejectionReason =
  | "target-maximum-reached"
  | "token-budget-exceeded"
  | "syllable-budget-exceeded"
  | "boundary-budget-exceeded"
  | "same-entry-repetition-exceeded"
  | "common-share-unrecoverable"
  | "relation-concentration-unrecoverable"
  | "no-marginal-gain"
  | "marginal-gain-below-threshold"
  | "beam-path-dominated";

export interface CandidateCost {
  readonly tokens: number;
  readonly syllables: number;
  readonly lexicalBoundaries: number;
}

export interface CandidateScore {
  readonly candidateEntryId: string;
  readonly marginalGain: number;
  readonly gainPerToken: number;
  readonly frequencyContribution: number;
  readonly diversityPenalty: number;
  readonly repetitionPenalty: number;
  readonly recentEntryPenalty: number;
  readonly recentTokenPathPenalty: number;
  readonly strategyScore: number;
  readonly randomTieBreaker: number;
  readonly cost: CandidateCost;
  readonly rejectionReasons: readonly CandidateRejectionReason[];
}

export interface HigherRankedAlternativeRejection {
  readonly candidateEntryId: string;
  readonly reasonCodes: readonly CandidateRejectionReason[];
}

export type SelectionReason =
  | "highest-marginal-gain"
  | "highest-gain-per-token"
  | "best-diversity-adjusted-score"
  | "fixed-six-ranked-pick"
  | "beam-search-path-pick";

export interface SelectionTrace {
  readonly position: number;
  readonly selectedEntryId: string;
  readonly selectedTargetEvidence: readonly TargetEvidence[];
  readonly marginalGain: number;
  readonly tokenCost: number;
  readonly syllableCost: number;
  readonly boundaryCost: number;
  readonly frequencyContribution: number;
  readonly diversityPenalty: number;
  readonly repetitionPenalty: number;
  readonly recentEntryPenalty: number;
  readonly recentTokenPathPenalty: number;
  readonly strategyScore: number;
  readonly selectionReason: SelectionReason;
  readonly higherRankedAlternativeRejections: readonly HigherRankedAlternativeRejection[];
  readonly rankedCandidates: readonly CandidateScore[];
}

export interface PracticeSequenceItem {
  readonly entry: CatalogEntry;
  readonly targetEvidence: readonly TargetEvidence[];
}

export interface TargetCoverage {
  readonly targetKey: string;
  readonly relation: RelationRef;
  readonly minimumExposures: number;
  readonly preferredExposures: number;
  readonly maximumExposures: number;
  readonly achievedExposures: number;
  readonly distinctSupportingEntries: number;
  readonly exactOccurrenceCount: number;
  readonly contrastRequirementCount: number;
  readonly satisfiedMinimum: boolean;
  readonly satisfiedPreferred: boolean;
}

export interface CoverageSummary {
  readonly targets: readonly TargetCoverage[];
  readonly totalTargetExposures: number;
  readonly distinctSupportingEntries: number;
  readonly commonWordShare: number;
  readonly maximumObservedRelationConcentration: number;
  readonly satisfiedMinimum: boolean;
  readonly satisfiedPreferred: boolean;
}

export interface BudgetUsage {
  readonly tokens: number;
  readonly syllables: number;
  readonly lexicalBoundaries: number;
  readonly selectedEntries: number;
  readonly commonEntries: number;
  readonly entryUses: Readonly<Record<string, number>>;
}

export type StopReason =
  | "target-satisfied"
  | "token-budget-exhausted"
  | "syllable-budget-exhausted"
  | "boundary-budget-exhausted"
  | "no-supporting-candidates"
  | "insufficient-diverse-support"
  | "marginal-gain-below-threshold"
  | "policy-conflict"
  | "fallback-completed";

export type FallbackReason =
  | "fixed-six-cap-reached"
  | "support-exhausted-before-preferred"
  | "minimum-met-preferred-unreachable"
  | "partial-sequence-retained"
  | "coverage-objective-not-composable"
  | "inconsistent-objective-scope"
  | "invalid-budget"
  | "confusion-contrast-pool-missing"
  | "invalid-random-source";

export interface PracticeSequence {
  readonly id: string;
  readonly mode: PracticeMode | null;
  readonly layoutId: string | null;
  readonly objective: RelationObjective;
  readonly strategy: CompositionStrategyId;
  readonly items: readonly PracticeSequenceItem[];
  readonly tokenCount: number;
  readonly syllableCount: number;
  readonly boundaryCount: number;
  readonly targetExposureCount: number;
  readonly selectionTrace: readonly SelectionTrace[];
  readonly retrievalTrace: RetrievalTrace;
  readonly coverageSummary: CoverageSummary;
  readonly budgetUsage: BudgetUsage;
  readonly stopReason: StopReason;
  readonly fallbackReasons: readonly FallbackReason[];
}

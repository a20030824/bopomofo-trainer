import type { CatalogEntry, PracticeMode } from "../core/model.js";
import type { RelationOccurrence } from "../relations/types.js";
import type { RelationObjective } from "../curriculum/objectives.js";

export interface NumericBudget {
  readonly minimum: number;
  readonly maximum: number;
}

export interface LexicalConstraints {
  readonly minimumCommonShare: number;
  readonly allowedTags: readonly string[] | null;
  readonly excludedTags: readonly string[];
  readonly requireReviewedProvenance: boolean;
}

export interface RepetitionConstraints {
  readonly recentEntryWindow: number;
  readonly recentPathWindow: number;
  readonly maximumEntryUses: number | null;
  readonly maximumObjectiveConcentration: number;
}

export interface ContentQuery {
  readonly objective: RelationObjective;
  readonly targetExposureBudget: NumericBudget;
  readonly tokenBudget: NumericBudget;
  readonly syllableBudget: NumericBudget;
  readonly entryLimit: number | null;
  readonly lexical: LexicalConstraints;
  readonly repetition: RepetitionConstraints;
  readonly evaluationEntryIds: readonly string[];
}

export interface CandidateCostBreakdown {
  readonly rarity: number;
  readonly recentEntry: number;
  readonly recentPath: number;
  readonly concentration: number;
  readonly boundary: number;
  readonly lexicalMismatch: number;
  readonly total: number;
}

export interface SequenceCandidate {
  readonly entry: CatalogEntry;
  readonly objectiveOccurrences: readonly RelationOccurrence[];
  readonly secondaryOccurrences: readonly RelationOccurrence[];
  readonly tokenCount: number;
  readonly syllableCount: number;
  readonly targetExposureGain: number;
  readonly cost: CandidateCostBreakdown;
}

export type SequenceStopReason =
  | "target-reached"
  | "token-budget"
  | "syllable-budget"
  | "entry-limit"
  | "no-supported-candidate"
  | "marginal-gain-too-low"
  | "constraint-conflict";

export interface CandidateDecisionTrace {
  readonly position: number;
  readonly candidates: readonly SequenceCandidate[];
  readonly selectedEntryId: string | null;
  readonly reason: string;
}

export interface PracticeSequenceItem {
  readonly entry: CatalogEntry;
  readonly objectiveOccurrences: readonly RelationOccurrence[];
  readonly secondaryOccurrences: readonly RelationOccurrence[];
}

export interface PracticeSequence {
  readonly id: string;
  readonly mode: PracticeMode;
  readonly layoutId: string;
  readonly objective: RelationObjective;
  readonly items: readonly PracticeSequenceItem[];
  readonly tokenCount: number;
  readonly syllableCount: number;
  readonly boundaryCount: number;
  readonly targetExposureCount: number;
  readonly stopReason: SequenceStopReason;
  readonly trace: readonly CandidateDecisionTrace[];
}

export type CompositionStrategyId =
  | "fixed-six-baseline"
  | "greedy-target-exposure"
  | "balanced-set-cover"
  | "confusion-contrast"
  | "constrained-multi-objective";

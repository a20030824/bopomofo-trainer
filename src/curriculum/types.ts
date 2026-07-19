import type { BindingSkillScope, CatalogEntry, Exercise, PracticeMode, TokenId } from "../core/model.js";
import type { BindingAggregate } from "../measurement/types.js";

export type CurriculumState = "unobserved" | "sampling" | "eligible" | "focused" | "cooldown";
export type CurriculumPhase = "coverage" | "adaptive";
export type CurriculumEvidence = "timed" | "correctness-only";

export interface CurriculumPolicy {
  readonly version: string;
  readonly minimumAttempts: number;
  readonly minimumTimingSamples: number;
  readonly minimumCatalogEntries: number;
  readonly coverageTargetAttempts: number;
  readonly toneCoverageTargetAttempts: number;
  readonly exerciseEntryCount: number;
  readonly focusedEntryShare: number;
  readonly focusedEntryBoost: number;
  readonly cooldownRounds: number;
  readonly errorWeight: number;
  readonly timingWeight: number;
  readonly frequencyBandWeights: Readonly<Record<1 | 2 | 3, number>>;
  readonly recentEntryPenalty: number;
  readonly recentTokenPenalty: number;
}

export interface CatalogTokenSupport {
  readonly tokenId: TokenId;
  readonly entryIds: readonly string[];
  readonly entryCount: number;
  readonly bindingEntryIds: readonly string[];
  readonly bindingEntryCount: number;
  readonly motorEntryIds: readonly string[];
  readonly motorEntryCount: number;
  readonly commonEntryCount: number;
  readonly commonBindingEntryCount: number;
  readonly commonMotorEntryCount: number;
  readonly frequencyBandCounts: Readonly<Record<1 | 2 | 3, number>>;
}

export interface CatalogSupportIndex {
  readonly byToken: Readonly<Record<string, CatalogTokenSupport>>;
  readonly entriesById: Readonly<Record<string, CatalogEntry>>;
}

export interface CurriculumBindingRecord {
  readonly scope: BindingSkillScope;
  readonly aggregate: BindingAggregate | null;
  readonly lastFocusedRound: number | null;
}

export interface CurriculumProfile {
  readonly mode: PracticeMode;
  readonly layoutId: string;
  readonly round: number;
  readonly bindings: Readonly<Record<string, CurriculumBindingRecord>>;
  readonly recentEntryIds: readonly string[];
  readonly recentTokenIds: readonly TokenId[];
}

export interface BindingStateDecision {
  readonly tokenId: TokenId;
  readonly state: CurriculumState;
  readonly reason: string;
  readonly evidence: CurriculumEvidence | null;
  readonly supportCount: number;
  readonly bindingSupportCount: number;
  readonly motorSupportCount: number;
  readonly attempts: number;
  readonly timingSamples: number;
}

export interface FocusScore {
  readonly tokenId: TokenId;
  readonly evidence: CurriculumEvidence;
  readonly errorRate: number;
  readonly timingRatio: number | null;
  readonly score: number;
  readonly supportCount: number;
}

export interface FocusSelection {
  readonly phase: CurriculumPhase;
  readonly tokenId: TokenId | null;
  readonly evidence: CurriculumEvidence | null;
  readonly reason: string;
  readonly candidates: readonly FocusScore[];
}

export interface ExerciseCandidateWeight {
  readonly entryId: string;
  readonly containsFocus: boolean;
  readonly frequencyWeight: number;
  readonly focusWeight: number;
  readonly recentEntryWeight: number;
  readonly recentTokenWeight: number;
  readonly totalWeight: number;
}

export interface ExercisePickTrace {
  readonly position: number;
  readonly pool: "focused" | "general";
  readonly candidates: readonly ExerciseCandidateWeight[];
  readonly selectedEntryId: string;
}

export interface BuiltCurriculumExercise {
  readonly exercise: Exercise;
  readonly focusTokenId: TokenId | null;
  readonly focusEvidence: CurriculumEvidence | null;
  readonly picks: readonly ExercisePickTrace[];
  readonly fallbackReasons: readonly string[];
}

export interface BindingStateTransition {
  readonly tokenId: TokenId;
  readonly from: CurriculumState | null;
  readonly to: CurriculumState;
  readonly reason: string;
}

export interface SimulationRoundReport {
  readonly round: number;
  readonly phase: CurriculumPhase;
  readonly focus: FocusSelection;
  readonly states: readonly BindingStateDecision[];
  readonly stateTransitions: readonly BindingStateTransition[];
  readonly exerciseEntryIds: readonly string[];
  readonly tokenExposure: Readonly<Record<string, number>>;
  readonly bindingObservationExposure: Readonly<Record<string, number>>;
  readonly motorTimingExposure: Readonly<Record<string, number>>;
  readonly frequencyBands: Readonly<Record<"1" | "2" | "3", number>>;
  readonly repeatedEntryCount: number;
  readonly fallbackReasons: readonly string[];
  readonly picks: readonly ExercisePickTrace[];
}

export interface CurriculumSimulationReport {
  readonly scenario: string;
  readonly seed: string;
  readonly policyVersion: string;
  readonly rounds: readonly SimulationRoundReport[];
  readonly determinismDigest: string;
}

import type { ReferenceRelationContribution } from "./contribution-types.js";
import type { ReferenceCandidate } from "./types.js";

export type ReferenceRankingProfile =
  | "partition-repair"
  | "binding-broadening"
  | "transition-broadening"
  | "balanced-review";

export interface ReferenceRankComponents {
  readonly partitionRepairBindingCount: number;
  readonly partitionRepairTransitionCount: number;
  readonly rareOnlyBindingCount: number;
  readonly rareOnlyTransitionCount: number;
  readonly bindingDeficitReduction: number;
  readonly transitionDeficitReduction: number;
  readonly newObservedBindingCount: number;
  readonly newObservedTransitionCount: number;
  readonly oralPerMillion: number | null;
  readonly writtenPerMillion: number | null;
  readonly levelOrdinal: number | null;
  readonly tokenCount: number;
}

export interface RankedReferenceCandidate {
  readonly candidate: ReferenceCandidate;
  readonly contribution: ReferenceRelationContribution;
  readonly profile: ReferenceRankingProfile;
  readonly components: ReferenceRankComponents;
  readonly priorityVector: readonly number[];
  readonly rank: number;
}

export type ReferenceExclusionReason =
  | "already-reviewed"
  | "policy-excluded"
  | "duplicate-candidate-id"
  | "duplicate-reference-identity";

export interface ReferenceReviewExclusion {
  readonly candidateId: string;
  readonly reason: ReferenceExclusionReason;
  readonly detail: string;
}

export interface ReferenceReviewQueue {
  readonly profile: ReferenceRankingProfile;
  readonly ranked: readonly RankedReferenceCandidate[];
  readonly excluded: readonly ReferenceReviewExclusion[];
}

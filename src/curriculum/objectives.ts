import type {
  BindingRelationRef,
  ConfusionRelationRef,
  RelationKind,
  RelationRef,
  TransitionRelationRef,
} from "../relations/types.js";

export interface RelationDemand {
  readonly relation: RelationRef;
  readonly minimumExposures: number;
  readonly preferredExposures: number;
  readonly maximumExposures: number;
  readonly weight: number;
}

export type RelationObjective =
  | {
      readonly kind: "coverage";
      readonly relationKinds: readonly RelationKind[];
    }
  | {
      readonly kind: "binding";
      readonly relation: BindingRelationRef;
    }
  | {
      readonly kind: "transition";
      readonly relation: TransitionRelationRef;
    }
  | {
      readonly kind: "confusion";
      readonly relation: ConfusionRelationRef;
    }
  | {
      readonly kind: "combined";
      readonly demands: readonly RelationDemand[];
    };

export interface ObjectiveCandidateScore {
  readonly relation: RelationRef;
  readonly eligible: boolean;
  readonly score: number | null;
  readonly supportCount: number;
  readonly components: Readonly<Record<string, number | null>>;
  readonly reason: string;
}

export interface ObjectiveDecision {
  readonly objective: RelationObjective;
  readonly candidates: readonly ObjectiveCandidateScore[];
  readonly fallbackReason: string | null;
}

export type ObjectiveStrategyId =
  | "frequency-random"
  | "binding-only-baseline"
  | "transition-aware"
  | "confusion-aware"
  | "combined-relational";

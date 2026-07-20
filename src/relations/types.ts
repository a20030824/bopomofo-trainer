import type {
  BindingSkillScope,
  FrequencyBand,
  TokenId,
} from "../core/model.js";
import type {
  ConfusionSkillScope,
  TransitionSkillScope,
} from "../measurement/types.js";

export type RelationKind = "binding" | "transition" | "confusion";
export type CatalogPartition = "training" | "evaluation";

export interface CatalogOccurrenceBase {
  readonly entryId: string;
  readonly syllableIndex: number;
  readonly frequencyBand: FrequencyBand;
  readonly tags: readonly string[];
  readonly provenanceIds: readonly string[];
  readonly partition: CatalogPartition;
}

export interface BindingOccurrence extends CatalogOccurrenceBase {
  readonly kind: "binding";
  readonly tokenIndex: number;
  readonly tokenId: TokenId;
  readonly context: "syllable-start" | "within-syllable" | "tone";
}

export interface TransitionOccurrence extends CatalogOccurrenceBase {
  readonly kind: "transition";
  readonly fromTokenIndex: number;
  readonly fromToken: TokenId;
  readonly toToken: TokenId;
}

export type RelationOccurrence = BindingOccurrence | TransitionOccurrence;

export interface BindingRelationRef {
  readonly kind: "binding";
  readonly scope: BindingSkillScope;
}

export interface TransitionRelationRef {
  readonly kind: "transition";
  readonly scope: TransitionSkillScope;
}

export interface ConfusionRelationRef {
  readonly kind: "confusion";
  readonly scope: ConfusionSkillScope;
}

export type RelationRef =
  | BindingRelationRef
  | TransitionRelationRef
  | ConfusionRelationRef;

export interface FrequencyBandCounts {
  readonly 1: number;
  readonly 2: number;
  readonly 3: number;
}

export interface RelationSupportSummary {
  readonly relation: RelationRef;
  readonly occurrenceCount: number;
  readonly distinctEntryCount: number;
  readonly frequencyBandCounts: FrequencyBandCounts;
  readonly commonEntryCount: number;
  readonly entryConcentration: number;
  readonly trainingOccurrenceCount: number;
  readonly evaluationOccurrenceCount: number;
  readonly supportState:
    | "unsupported"
    | "evaluation-only"
    | "rare-only"
    | "concentrated"
    | "supported";
}

export interface ConfusionContrastPool {
  readonly relation: ConfusionRelationRef;
  readonly expectedEntryIds: readonly string[];
  readonly actualEntryIds: readonly string[];
  readonly sharedEntryIds: readonly string[];
}

export interface CatalogRelationIndex {
  readonly bindingOccurrences: Readonly<Record<string, readonly BindingOccurrence[]>>;
  readonly transitionOccurrences: Readonly<Record<string, readonly TransitionOccurrence[]>>;
  readonly support: Readonly<Record<string, RelationSupportSummary>>;
  readonly confusionContrastPools: Readonly<Record<string, ConfusionContrastPool>>;
}

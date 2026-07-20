import type { CatalogEntry, Exercise, PracticeMode, TokenId } from "../core/model.js";
import type {
  CatalogSupportIndex,
  CurriculumEvidence,
  CurriculumPhase,
  CurriculumPolicy,
  CurriculumProfile,
  FocusSelection,
} from "../curriculum/types.js";
import type {
  FrequencyFirstSelectionState,
  FrequencyFirstUtterancePolicy,
  FrequencyFirstUtteranceSelection,
  FrequencyStage,
} from "../curriculum/frequency-first-utterance.js";
import type { GrammarAnnotation } from "../grammar/types.js";
import type { MeasurementPolicy, MeasurementSummary } from "../measurement/types.js";
import type { InteractionSessionState } from "../practice/interaction-session.js";

export const PRODUCT_PROGRESS_SCHEMA_VERSION = 2 as const;

export type ProductRoundKind = "practice" | "evaluation";

export interface ProductCatalogs {
  readonly practice: readonly CatalogEntry[];
  readonly evaluation: readonly CatalogEntry[];
  readonly grammarAnnotations: Readonly<Record<string, GrammarAnnotation>>;
}

export interface ProductRound {
  readonly kind: ProductRoundKind;
  readonly exercise: Exercise;
  readonly focus: FocusSelection | null;
  readonly selection: FrequencyFirstUtteranceSelection;
}

export interface ProductRoundSummary {
  readonly kind: ProductRoundKind;
  readonly exerciseId: string;
  readonly completedAt: string;
  readonly entryIds: readonly string[];
  readonly utteranceId: string;
  readonly templateId: string | null;
  readonly frequencyStage: FrequencyStage;
  readonly phase: CurriculumPhase | "evaluation";
  readonly focusTokenId: TokenId | null;
  readonly focusEvidence: CurriculumEvidence | null;
  readonly attempts: number;
  readonly errors: number;
  readonly timingSamples: number;
}

export interface ProductProgress {
  readonly schemaVersion: typeof PRODUCT_PROGRESS_SCHEMA_VERSION;
  readonly seed: string;
  readonly mode: PracticeMode;
  readonly layoutId: string;
  readonly measurements: MeasurementSummary;
  readonly curriculumPolicyVersion: string;
  readonly curriculum: CurriculumProfile;
  readonly selection: FrequencyFirstSelectionState;
  readonly practiceRoundsCompleted: number;
  readonly evaluationRoundsCompleted: number;
  readonly recentSummaries: readonly ProductRoundSummary[];
}

export interface ProductEnvironment {
  readonly catalogs: ProductCatalogs;
  readonly practiceSupport: CatalogSupportIndex;
  readonly evaluationSupport: CatalogSupportIndex;
  readonly measurementPolicy: MeasurementPolicy;
  readonly curriculumPolicy: CurriculumPolicy;
  readonly utterancePolicy: FrequencyFirstUtterancePolicy;
  readonly evaluationInterval: number;
  readonly evaluationEntryCount: number;
}

export interface ProductState {
  readonly progress: ProductProgress;
  readonly round: ProductRound;
  readonly session: InteractionSessionState;
  readonly summary: ProductRoundSummary | null;
}

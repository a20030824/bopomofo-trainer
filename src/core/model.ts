export type TokenId = string;
export type FrequencyBand = 1 | 2 | 3;
export type PracticeMode = "guided" | "recall";
export type TimingContext =
  | "exercise-start"
  | "entry-start"
  | "syllable-start"
  | "within-syllable"
  | "tone";

export interface TokenDefinition {
  readonly id: TokenId;
  readonly label: string;
  readonly kind: "bopomofo" | "tone";
}

export interface Prompt {
  readonly text: string;
  readonly locale: "zh-TW";
}

export interface Syllable {
  readonly tokens: readonly TokenId[];
}

export interface CatalogEntry {
  readonly id: string;
  readonly prompt: Prompt;
  readonly syllables: readonly Syllable[];
  readonly frequencyBand: FrequencyBand;
  readonly tags: readonly string[];
  readonly provenanceIds: readonly string[];
}

export interface Exercise {
  readonly id: string;
  readonly mode: PracticeMode;
  readonly layoutId: string;
  readonly entries: readonly CatalogEntry[];
}

export interface InputLayout {
  readonly id: string;
  readonly name: string;
  readonly bindings: Readonly<Record<string, TokenId>>;
}

export interface InputObservation {
  readonly exerciseId: string;
  readonly entryId: string;
  readonly mode: PracticeMode;
  readonly layoutId: string;
  readonly expectedToken: TokenId;
  readonly actualToken: TokenId | null;
  readonly physicalCode: string;
  readonly previousToken: TokenId | null;
  readonly latencyMs: number;
  readonly correct: boolean;
  readonly position: number;
  readonly context: TimingContext;
}

export interface BindingSkillScope {
  readonly mode: PracticeMode;
  readonly layoutId: string;
  readonly tokenId: TokenId;
}

export interface SkillStats {
  readonly attempts: number;
  readonly errors: number;
  readonly currentTimeToTypeMs: number | null;
  readonly bestTimeToTypeMs: number | null;
  readonly currentConfidence: number | null;
  readonly bestConfidence: number | null;
}

export interface TransitionStats {
  readonly attempts: number;
  readonly errors: number;
  readonly currentTimeToTypeMs: number | null;
}

export interface LearnerProfile {
  readonly bindingStats: Readonly<Record<string, SkillStats>>;
  readonly transitionStats: Readonly<Record<string, TransitionStats>>;
  readonly confusionStats: Readonly<Record<string, number>>;
}

export interface RandomSource {
  next(): number;
}

export interface ProgressStore {
  load(profileId: string): Promise<LearnerProfile | null>;
  save(profileId: string, profile: LearnerProfile): Promise<void>;
}

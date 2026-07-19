export type TokenId = string;
export type FrequencyBand = 1 | 2 | 3;
export type TimingContext =
  | "prompt-start"
  | "syllable-start"
  | "within-syllable"
  | "tone";

export interface TokenDefinition {
  readonly id: TokenId;
  readonly label: string;
  readonly kind: "initial" | "medial" | "final" | "tone";
}

export interface Prompt {
  readonly text: string;
  readonly locale: "zh-TW";
}

export interface Syllable {
  readonly tokens: readonly TokenId[];
}

export interface TrainingItem {
  readonly id: string;
  readonly prompt: Prompt;
  readonly syllables: readonly Syllable[];
  readonly frequencyBand: FrequencyBand;
  readonly tags: readonly string[];
}

export interface InputLayout {
  readonly id: string;
  readonly name: string;
  readonly bindings: Readonly<Record<string, TokenId>>;
}

export interface InputObservation {
  readonly itemId: string;
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

export interface TokenStats {
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
  readonly tokenStats: Readonly<Record<TokenId, TokenStats>>;
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

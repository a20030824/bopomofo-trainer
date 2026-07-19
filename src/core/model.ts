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

export interface BindingSkillScope {
  readonly mode: PracticeMode;
  readonly layoutId: string;
  readonly tokenId: TokenId;
}

export interface RandomSource {
  next(): number;
}

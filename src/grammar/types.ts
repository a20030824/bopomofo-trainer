import type { CatalogEntry } from "../core/model.js";

export const GRAMMAR_ROLES = [
  "temporal",
  "subject",
  "object",
  "intransitive-predicate",
  "transitive-predicate",
  "modal",
  "verb",
  "adjectival-predicate",
  "adverbial",
  "formulaic",
] as const;

export type GrammarRole = (typeof GRAMMAR_ROLES)[number];

export const PREDICATE_FRAMES = [
  "none",
  "intransitive",
  "transitive",
  "modal",
  "adjectival",
] as const;

export type PredicateFrame = (typeof PREDICATE_FRAMES)[number];

export const STANDALONE_KINDS = [
  "none",
  "lexical-prompt",
  "utterance",
] as const;

export type StandaloneKind = (typeof STANDALONE_KINDS)[number];

export interface GrammarAnnotation {
  readonly entryId: string;
  readonly roles: readonly GrammarRole[];
  readonly predicateFrame: PredicateFrame;
  readonly standaloneKind: StandaloneKind;
  readonly provenanceIds: readonly string[];
}

export type GrammarAnnotationErrorCode =
  | "missing-field"
  | "unknown-entry"
  | "duplicate-annotation"
  | "missing-annotation"
  | "invalid-role"
  | "invalid-predicate-frame"
  | "invalid-standalone-kind"
  | "inconsistent-predicate-frame"
  | "invalid-formulaic-role"
  | "missing-provenance"
  | "unknown-provenance";

export interface GrammarAnnotationError {
  readonly code: GrammarAnnotationErrorCode;
  readonly message: string;
  readonly rowNumber: number;
  readonly text: string | null;
  readonly field: string | null;
}

export interface GrammarAnnotationCompilationResult {
  readonly annotations: Readonly<Record<string, GrammarAnnotation>>;
  readonly errors: readonly GrammarAnnotationError[];
}

export interface GrammarTemplateSlot {
  readonly key: string;
  readonly role: GrammarRole;
}

export interface GrammarTemplate {
  readonly id: string;
  readonly slots: readonly GrammarTemplateSlot[];
  readonly punctuation: "。" | "！" | "？" | null;
}

export interface GrammarSlotAssignment {
  readonly slotKey: string;
  readonly role: GrammarRole;
  readonly entryId: string;
}

export type GrammarCandidateKind =
  | "template"
  | "standalone-utterance"
  | "standalone-lexical-prompt";

export interface GrammarUtteranceCandidate {
  readonly id: string;
  readonly kind: GrammarCandidateKind;
  readonly templateId: string | null;
  readonly entries: readonly CatalogEntry[];
  readonly assignments: readonly GrammarSlotAssignment[];
  readonly text: string;
  readonly punctuation: GrammarTemplate["punctuation"];
}

export interface GrammarCompositionOptions {
  readonly maximumCandidates: number;
  readonly allowLexicalPromptFallback: boolean;
}

export interface GrammarCompositionResult {
  readonly candidates: readonly GrammarUtteranceCandidate[];
  readonly fallbackReasons: readonly string[];
}

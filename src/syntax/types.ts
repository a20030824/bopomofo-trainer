import type {
  FORMAL_GRAMMAR_VERSION,
  SYNTAX_CATEGORIES,
  SYNTAX_FEATURE_NAMES,
} from "./features.js";

export const UPOS_VALUES = [
  "ADJ",
  "ADP",
  "ADV",
  "AUX",
  "CCONJ",
  "DET",
  "INTJ",
  "NOUN",
  "NUM",
  "PART",
  "PRON",
  "PROPN",
  "PUNCT",
  "SCONJ",
  "SYM",
  "VERB",
  "X",
] as const;

export type Upos = (typeof UPOS_VALUES)[number];

export const SYNTACTIC_FUNCTIONS = [
  "subject",
  "object",
  "indirect-object",
  "predicate",
  "modifier",
  "adverbial",
  "oblique",
  "complement",
  "adposition",
  "determiner",
  "numeral",
  "classifier",
  "auxiliary",
  "copula",
  "marker",
  "coordinator",
  "conjunct",
  "punctuation",
  "discourse",
  "unspecified",
] as const;

export type SyntacticFunction = (typeof SYNTACTIC_FUNCTIONS)[number];

export const VALENCY_FRAMES = [
  "avalent",
  "intransitive",
  "transitive",
  "ditransitive",
  "ambitransitive",
  "copular",
  "clausal-complement",
  "open-clausal-complement",
  "adpositional-complement",
  "serial-verb",
  "causative",
  "resultative",
] as const;

export type ValencyFrame = (typeof VALENCY_FRAMES)[number];
export type SyntaxEvidenceScope = "per-upos" | "aggregate-legacy";
export type DependencyCountMap = Readonly<Record<string, number>>;

export interface AnonymousDependencySkeletonNode {
  readonly upos: Upos;
  readonly relation: string;
  readonly direction:
    | "head-left"
    | "head-right"
    | "root"
    | "child-left"
    | "child-right";
  readonly children?: readonly AnonymousDependencySkeletonNode[];
}

export interface AnonymousDependencySkeletonEvidence {
  readonly count: number;
  readonly skeleton: AnonymousDependencySkeletonNode;
}

export interface SyntaxCompatibilityEvidence {
  readonly dependencyRelationCounts: DependencyCountMap;
  readonly surfacePositionCounts: DependencyCountMap;
}

export interface DependencyEvidence extends SyntaxCompatibilityEvidence {
  readonly evidenceScope: SyntaxEvidenceScope;
  readonly occurrenceCount: number;
  readonly morphologicalFeatureCounts: DependencyCountMap;
  readonly parentUposCounts: DependencyCountMap;
  readonly headDirectionCounts: DependencyCountMap;
  readonly childRelationCounts: DependencyCountMap;
  readonly childDirectionRelationCounts: DependencyCountMap;
  readonly childRelationMultisetCounts: DependencyCountMap;
  readonly valencyRelationCounts: DependencyCountMap;
  readonly valencySignatureCounts: DependencyCountMap;
  readonly constructionRelationCounts: DependencyCountMap;
  readonly anonymousDependencySkeletons: readonly AnonymousDependencySkeletonEvidence[];
  readonly rootCount: number;
}

export interface RuntimeSyntaxProfile {
  readonly id: string;
  readonly entryId: string;
  readonly upos: Upos;
  readonly functions: readonly SyntacticFunction[];
  readonly valencyFrames: readonly ValencyFrame[];
  readonly dependencyEvidence: SyntaxCompatibilityEvidence;
  readonly provenanceIds: readonly string[];
}

export interface SyntaxProfile extends RuntimeSyntaxProfile {
  readonly dependencyEvidence: DependencyEvidence;
}

export interface SyntaxProfileProjectionResult {
  readonly profiles: readonly SyntaxProfile[];
  readonly profilesByEntryId: Readonly<Record<string, readonly SyntaxProfile[]>>;
  readonly noUdEvidenceEntryIds: readonly string[];
  readonly projectionDigest: string;
}

export type FormalGrammarVersion = typeof FORMAL_GRAMMAR_VERSION;
export type SyntaxCategory = (typeof SYNTAX_CATEGORIES)[number];
export type SyntaxFeatureName = (typeof SYNTAX_FEATURE_NAMES)[number];
export type SyntaxFeatureValue = string | number | boolean;
export type SyntaxFeatureSet = Readonly<Partial<Record<SyntaxFeatureName, SyntaxFeatureValue>>>;

export interface DerivationBounds {
  readonly maximumPhraseDepth: number;
  readonly maximumClauseNesting: number;
  readonly maximumClausesPerSentence: number;
  readonly maximumCoordinationItems: number;
  readonly maximumConsecutiveModifiers: number;
  readonly maximumComplementsPerPredicate: number;
  readonly maximumLexicalEntriesPerUtterance: number;
}

export interface ProductionConstituent {
  readonly key: string;
  readonly category: SyntaxCategory;
  readonly minimum: number;
  readonly maximum: number;
  readonly recursive: boolean;
  readonly allowedUpos: readonly Upos[];
  readonly requiredFunctions: readonly SyntacticFunction[];
  readonly requiredValencyFrames: readonly ValencyFrame[];
  readonly requiredFeatures: SyntaxFeatureSet;
}

export interface SurfaceOrder {
  readonly id: string;
  readonly constituentKeys: readonly string[];
}

export type ProductionConstraint =
  | {
      readonly kind: "feature-equals" | "feature-not-equals";
      readonly constituentKey: string;
      readonly feature: SyntaxFeatureName;
      readonly value: SyntaxFeatureValue;
    }
  | {
      readonly kind: "requires-constituent" | "forbids-cooccurrence";
      readonly ifPresentKey: string;
      readonly targetKey: string;
    };

export interface ProductionRule {
  readonly id: string;
  readonly grammarVersion: FormalGrammarVersion;
  readonly output: SyntaxCategory;
  readonly constituents: readonly ProductionConstituent[];
  readonly surfaceOrders: readonly SurfaceOrder[];
  readonly constraints: readonly ProductionConstraint[];
  readonly positiveFixtureIds: readonly string[];
  readonly negativeFixtureIds: readonly string[];
}

export interface ProductionFixture {
  readonly id: string;
  readonly ruleId: string;
  readonly expected: "accept" | "reject";
  readonly surfaceOrderId: string;
  readonly constituentCounts: Readonly<Record<string, number>>;
}

export interface SyntaxNode {
  readonly id: string;
  readonly category: SyntaxCategory;
  readonly features: SyntaxFeatureSet;
  readonly productionRuleId: string | null;
  readonly syntaxProfileId: string | null;
  readonly children: readonly SyntaxNode[];
}

export interface Derivation {
  readonly id: string;
  readonly grammarVersion: FormalGrammarVersion;
  readonly root: SyntaxNode;
  readonly productionRulePath: readonly string[];
  readonly syntaxProfileIds: readonly string[];
}

export interface SurfaceToken {
  readonly kind: "lexical-entry" | "punctuation";
  readonly value: string;
  readonly entryId: string | null;
  readonly syntaxProfileId: string | null;
}

export interface SurfaceRealization {
  readonly id: string;
  readonly grammarVersion: FormalGrammarVersion;
  readonly derivationId: string;
  readonly productionRulePath: readonly string[];
  readonly entryIds: readonly string[];
  readonly syntaxProfileIds: readonly string[];
  readonly tokens: readonly SurfaceToken[];
}

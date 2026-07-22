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

export interface DependencyEvidence {
  readonly evidenceScope: SyntaxEvidenceScope;
  readonly occurrenceCount: number;
  readonly dependencyRelationCounts: DependencyCountMap;
  readonly morphologicalFeatureCounts: DependencyCountMap;
  readonly parentUposCounts: DependencyCountMap;
  readonly headDirectionCounts: DependencyCountMap;
  readonly surfacePositionCounts: DependencyCountMap;
  readonly childRelationCounts: DependencyCountMap;
  readonly childDirectionRelationCounts: DependencyCountMap;
  readonly childRelationMultisetCounts: DependencyCountMap;
  readonly valencyRelationCounts: DependencyCountMap;
  readonly valencySignatureCounts: DependencyCountMap;
  readonly constructionRelationCounts: DependencyCountMap;
  readonly anonymousDependencySkeletons: readonly AnonymousDependencySkeletonEvidence[];
  readonly rootCount: number;
}

export interface SyntaxProfile {
  readonly id: string;
  readonly entryId: string;
  readonly upos: Upos;
  readonly functions: readonly SyntacticFunction[];
  readonly valencyFrames: readonly ValencyFrame[];
  readonly dependencyEvidence: DependencyEvidence;
  readonly provenanceIds: readonly string[];
}

export interface SyntaxProfileProjectionResult {
  readonly profiles: readonly SyntaxProfile[];
  readonly profilesByEntryId: Readonly<Record<string, readonly SyntaxProfile[]>>;
  readonly noUdEvidenceEntryIds: readonly string[];
  readonly projectionDigest: string;
}

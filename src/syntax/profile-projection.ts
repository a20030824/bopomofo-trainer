import type { CatalogEntry } from "../core/model.js";
import { canonicalJson, sha256Canonical } from "../reference/importers/canonical-json.js";
import {
  UPOS_VALUES,
  type AnonymousDependencySkeletonEvidence,
  type DependencyCountMap,
  type DependencyEvidence,
  type SyntacticFunction,
  type SyntaxEvidenceScope,
  type SyntaxProfile,
  type SyntaxProfileProjectionResult,
  type Upos,
  type ValencyFrame,
} from "./types.js";

interface RawSyntaxProfileEvidence {
  readonly upos: string;
  readonly occurrenceCount: number;
  readonly dependencyRelationCounts?: Readonly<Record<string, number>>;
  readonly morphologicalFeatureCounts?: Readonly<Record<string, number>>;
  readonly parentUposCounts?: Readonly<Record<string, number>>;
  readonly headDirectionCounts?: Readonly<Record<string, number>>;
  readonly surfacePositionCounts?: Readonly<Record<string, number>>;
  readonly childRelationCounts?: Readonly<Record<string, number>>;
  readonly childDirectionRelationCounts?: Readonly<Record<string, number>>;
  readonly childRelationMultisetCounts?: Readonly<Record<string, number>>;
  readonly valencyRelationCounts?: Readonly<Record<string, number>>;
  readonly valencySignatureCounts?: Readonly<Record<string, number>>;
  readonly constructionRelationCounts?: Readonly<Record<string, number>>;
  readonly anonymousDependencySkeletons?: readonly AnonymousDependencySkeletonEvidence[];
  readonly rootCount?: number;
}

export interface SyntaxEvidenceRow {
  readonly text: string;
  readonly observed: boolean;
  readonly occurrenceCount: number;
  readonly uposCounts?: Readonly<Record<string, number>>;
  readonly syntaxProfileEvidence?: readonly RawSyntaxProfileEvidence[];
  readonly dependencyRelationCounts?: Readonly<Record<string, number>>;
  readonly morphologicalFeatureCounts?: Readonly<Record<string, number>>;
  readonly parentUposCounts?: Readonly<Record<string, number>>;
  readonly headDirectionCounts?: Readonly<Record<string, number>>;
  readonly surfacePositionCounts?: Readonly<Record<string, number>>;
  readonly childRelationCounts?: Readonly<Record<string, number>>;
  readonly childDirectionRelationCounts?: Readonly<Record<string, number>>;
  readonly childRelationMultisetCounts?: Readonly<Record<string, number>>;
  readonly valencyRelationCounts?: Readonly<Record<string, number>>;
  readonly valencySignatureCounts?: Readonly<Record<string, number>>;
  readonly constructionRelationCounts?: Readonly<Record<string, number>>;
  readonly anonymousDependencySkeletons?: readonly AnonymousDependencySkeletonEvidence[];
  readonly rootCount?: number;
}

export interface SyntaxEvidenceArtifact {
  readonly schemaVersion?: string;
  readonly source?: {
    readonly sourceId?: string;
  };
  readonly rows: readonly SyntaxEvidenceRow[];
}

export interface SyntaxProfileProjectionOptions {
  readonly provenanceIds?: readonly string[];
}

/** Minimal lexical identity needed by syntax projection.
 *
 * Reading/catalog metadata is deliberately absent: UD evidence is attached to
 * a written form, so large candidate generations do not need fake readings or
 * product catalog entries before they can receive syntax profiles.
 */
export interface SyntaxProfileLexeme {
  readonly id: string;
  readonly text: string;
}

const UPOS_SET = new Set<string>(UPOS_VALUES);
const COMPLEMENT_RELATIONS = ["obj", "iobj", "ccomp", "xcomp", "obl"] as const;

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function asUpos(value: string): Upos {
  if (!UPOS_SET.has(value)) throw new Error(`unknown UPOS in syntax evidence: ${value}`);
  return value as Upos;
}

function normalizeCounts(
  value: Readonly<Record<string, number>> | undefined,
): DependencyCountMap {
  const result: Record<string, number> = {};
  for (const key of Object.keys(value ?? {}).sort(compareText)) {
    const count = value?.[key];
    if (!Number.isInteger(count) || count === undefined || count < 0) {
      throw new Error(`invalid syntax evidence count for ${key}`);
    }
    if (count > 0) result[key] = count;
  }
  return result;
}

function normalizeSkeletons(
  values: readonly AnonymousDependencySkeletonEvidence[] | undefined,
): readonly AnonymousDependencySkeletonEvidence[] {
  return [...(values ?? [])]
    .map((item) => {
      if (!Number.isInteger(item.count) || item.count <= 0) {
        throw new Error("anonymous dependency skeleton count must be positive");
      }
      return item;
    })
    .sort((left, right) => compareText(canonicalJson(left), canonicalJson(right)));
}

function normalizeEvidence(
  source: Omit<RawSyntaxProfileEvidence, "upos"> | SyntaxEvidenceRow,
  evidenceScope: SyntaxEvidenceScope,
  occurrenceCount: number,
): DependencyEvidence {
  if (!Number.isInteger(occurrenceCount) || occurrenceCount <= 0) {
    throw new Error("syntax profile occurrenceCount must be a positive integer");
  }
  const rootCount = source.rootCount ?? 0;
  if (!Number.isInteger(rootCount) || rootCount < 0) {
    throw new Error("syntax profile rootCount must be a non-negative integer");
  }
  return {
    evidenceScope,
    occurrenceCount,
    dependencyRelationCounts: normalizeCounts(source.dependencyRelationCounts),
    morphologicalFeatureCounts: normalizeCounts(source.morphologicalFeatureCounts),
    parentUposCounts: normalizeCounts(source.parentUposCounts),
    headDirectionCounts: normalizeCounts(source.headDirectionCounts),
    surfacePositionCounts: normalizeCounts(source.surfacePositionCounts),
    childRelationCounts: normalizeCounts(source.childRelationCounts),
    childDirectionRelationCounts: normalizeCounts(source.childDirectionRelationCounts),
    childRelationMultisetCounts: normalizeCounts(source.childRelationMultisetCounts),
    valencyRelationCounts: normalizeCounts(source.valencyRelationCounts),
    valencySignatureCounts: normalizeCounts(source.valencySignatureCounts),
    constructionRelationCounts: normalizeCounts(source.constructionRelationCounts),
    anonymousDependencySkeletons: normalizeSkeletons(source.anonymousDependencySkeletons),
    rootCount,
  };
}

function relationBase(value: string): string {
  return value.split(":", 1)[0] ?? value;
}

function functionForRelation(relation: string): SyntacticFunction {
  switch (relationBase(relation)) {
    case "nsubj":
    case "csubj":
      return "subject";
    case "obj":
      return "object";
    case "iobj":
      return "indirect-object";
    case "root":
      return "predicate";
    case "amod":
    case "acl":
    case "nmod":
    case "compound":
      return "modifier";
    case "advmod":
    case "advcl":
      return "adverbial";
    case "obl":
      return "oblique";
    case "ccomp":
    case "xcomp":
      return "complement";
    case "case":
      return "adposition";
    case "det":
      return "determiner";
    case "nummod":
      return "numeral";
    case "clf":
      return "classifier";
    case "aux":
      return "auxiliary";
    case "cop":
      return "copula";
    case "mark":
      return "marker";
    case "cc":
      return "coordinator";
    case "conj":
      return "conjunct";
    case "punct":
      return "punctuation";
    case "discourse":
      return "discourse";
    default:
      return "unspecified";
  }
}

function deriveFunctions(evidence: DependencyEvidence): readonly SyntacticFunction[] {
  const values = new Set<SyntacticFunction>();
  for (const relation of Object.keys(evidence.dependencyRelationCounts)) {
    values.add(functionForRelation(relation));
  }
  if (values.size === 0) values.add("unspecified");
  return [...values].sort(compareText);
}

function signatureCounts(signature: string): Readonly<Record<string, number>> {
  if (signature === "none") return {};
  const result: Record<string, number> = {};
  for (const item of signature.split("|")) {
    const [relation, rawCount] = item.split("=");
    const count = Number(rawCount);
    if (relation === undefined || !Number.isInteger(count) || count <= 0) {
      throw new Error(`invalid valency signature: ${signature}`);
    }
    result[relation] = count;
  }
  return result;
}

function deriveValencyFrames(
  upos: Upos,
  evidence: DependencyEvidence,
): readonly ValencyFrame[] {
  if (upos !== "VERB" && upos !== "AUX" && upos !== "ADJ") return ["avalent"];
  const frames = new Set<ValencyFrame>();
  let hasObjectBearing = false;
  let hasObjectless = false;
  for (const [signature, observations] of Object.entries(evidence.valencySignatureCounts)) {
    if (observations <= 0) continue;
    const counts = signatureCounts(signature);
    const hasComplement = COMPLEMENT_RELATIONS.some((relation) => (counts[relation] ?? 0) > 0);
    hasObjectless ||= !hasComplement;
    if ((counts.iobj ?? 0) > 0) {
      frames.add("ditransitive");
      hasObjectBearing = true;
    }
    if ((counts.obj ?? 0) > 0) {
      frames.add("transitive");
      hasObjectBearing = true;
    }
    if ((counts.ccomp ?? 0) > 0) frames.add("clausal-complement");
    if ((counts.xcomp ?? 0) > 0) frames.add("open-clausal-complement");
    if ((counts.obl ?? 0) > 0) frames.add("adpositional-complement");
  }
  if (hasObjectless) frames.add("intransitive");
  if (hasObjectBearing && hasObjectless) frames.add("ambitransitive");
  if ((evidence.constructionRelationCounts["child:cop"] ?? 0) > 0) {
    frames.add("copular");
  }
  if (frames.size === 0) frames.add("avalent");
  return [...frames].sort(compareText);
}

function rawProfiles(row: SyntaxEvidenceRow): readonly {
  readonly upos: Upos;
  readonly evidence: DependencyEvidence;
}[] {
  if (!row.observed || row.occurrenceCount <= 0) return [];
  if (row.syntaxProfileEvidence !== undefined) {
    const expected = new Set(
      Object.entries(row.uposCounts ?? {})
        .filter(([, count]) => count > 0)
        .map(([upos]) => asUpos(upos)),
    );
    const result = row.syntaxProfileEvidence.map((profile) => {
      const upos = asUpos(profile.upos);
      expected.delete(upos);
      return {
        upos,
        evidence: normalizeEvidence(profile, "per-upos", profile.occurrenceCount),
      };
    });
    if (expected.size > 0) {
      throw new Error(`syntaxProfileEvidence is missing UPOS: ${[...expected].sort(compareText).join(", ")}`);
    }
    return result;
  }
  return Object.entries(row.uposCounts ?? {})
    .filter(([, count]) => count > 0)
    .sort(([left], [right]) => compareText(left, right))
    .map(([rawUpos, count]) => ({
      upos: asUpos(rawUpos),
      evidence: normalizeEvidence(row, "aggregate-legacy", count),
    }));
}

function buildProfile(
  entryId: string,
  upos: Upos,
  dependencyEvidence: DependencyEvidence,
  provenanceIds: readonly string[],
): SyntaxProfile {
  const functions = deriveFunctions(dependencyEvidence);
  const valencyFrames = deriveValencyFrames(upos, dependencyEvidence);
  const identity = {
    entryId,
    upos,
    functions,
    valencyFrames,
    dependencyEvidence,
  };
  return {
    id: `syntax-profile:${sha256Canonical(identity)}`,
    entryId,
    upos,
    functions,
    valencyFrames,
    dependencyEvidence,
    provenanceIds,
  };
}

export function projectSyntaxProfilesForLexemes(
  lexemes: readonly SyntaxProfileLexeme[],
  artifact: SyntaxEvidenceArtifact,
  options: SyntaxProfileProjectionOptions = {},
): SyntaxProfileProjectionResult {
  const rowsByText = new Map<string, SyntaxEvidenceRow>();
  for (const row of artifact.rows) {
    if (!row.text || rowsByText.has(row.text)) {
      throw new Error(`invalid or duplicate syntax evidence text: ${row.text}`);
    }
    rowsByText.set(row.text, row);
  }
  const provenanceIds = [...new Set(
    options.provenanceIds
      ?? [artifact.source?.sourceId ?? "ud:syntax-evidence"],
  )].sort(compareText);
  if (provenanceIds.length === 0 || provenanceIds.some((value) => value.length === 0)) {
    throw new Error("syntax profiles require provenance IDs");
  }

  const profiles: SyntaxProfile[] = [];
  const profilesByEntryId: Record<string, readonly SyntaxProfile[]> = {};
  const noUdEvidenceEntryIds: string[] = [];
  const orderedLexemes = [...lexemes].sort((left, right) => compareText(left.id, right.id));
  const seenLexemeIds = new Set<string>();
  for (const lexeme of orderedLexemes) {
    if (!lexeme.id || !lexeme.text || seenLexemeIds.has(lexeme.id)) {
      throw new Error(`invalid or duplicate syntax lexeme identity: ${lexeme.id}`);
    }
    seenLexemeIds.add(lexeme.id);
    const row = rowsByText.get(lexeme.text);
    const candidates = row === undefined ? [] : rawProfiles(row);
    const unique = new Map<string, SyntaxProfile>();
    for (const candidate of candidates) {
      const profile = buildProfile(lexeme.id, candidate.upos, candidate.evidence, provenanceIds);
      unique.set(profile.id, profile);
    }
    const entryProfiles = [...unique.values()].sort((left, right) => compareText(left.id, right.id));
    profilesByEntryId[lexeme.id] = entryProfiles;
    profiles.push(...entryProfiles);
    if (entryProfiles.length === 0) noUdEvidenceEntryIds.push(lexeme.id);
  }
  const orderedProfiles = [...profiles].sort((left, right) => compareText(left.id, right.id));
  const projectionDigest = sha256Canonical({
    profiles: orderedProfiles,
    noUdEvidenceEntryIds,
  });
  return {
    profiles: orderedProfiles,
    profilesByEntryId,
    noUdEvidenceEntryIds,
    projectionDigest,
  };
}

export function projectSyntaxProfiles(
  entries: readonly CatalogEntry[],
  artifact: SyntaxEvidenceArtifact,
  options: SyntaxProfileProjectionOptions = {},
): SyntaxProfileProjectionResult {
  return projectSyntaxProfilesForLexemes(
    entries.map((entry) => ({ id: entry.id, text: entry.prompt.text })),
    artifact,
    options,
  );
}

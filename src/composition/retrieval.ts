import type { CatalogEntry, TokenId } from "../core/model.js";
import {
  bindingRelationKey,
  transitionRelationKey,
} from "../relations/catalog-occurrences.js";
import type {
  BindingOccurrence,
  CatalogRelationIndex,
  ConfusionContrastPool,
  ConfusionRelationRef,
  RelationOccurrence,
  RelationRef,
  TransitionOccurrence,
} from "../relations/types.js";
import type { ObjectiveTarget } from "./objective.js";
import type {
  ConfusionContrastRequirement,
  RetrievalCandidate,
  RetrievalExclusion,
  RetrievalTrace,
  TargetEvidence,
} from "./types.js";
import { compareText, stableStringify } from "./stable.js";

export interface RetrievalResult {
  readonly candidates: readonly RetrievalCandidate[];
  readonly trace: RetrievalTrace;
}

function pathSignature(entry: CatalogEntry): string {
  return stableStringify(entry.syllables.map((syllable) => syllable.tokens));
}

function tokenCount(entry: CatalogEntry): number {
  return entry.syllables.reduce((sum, syllable) => sum + syllable.tokens.length, 0);
}

function compareOccurrence(left: RelationOccurrence, right: RelationOccurrence): number {
  const entry = compareText(left.entryId, right.entryId);
  if (entry !== 0) return entry;
  if (left.syllableIndex !== right.syllableIndex) return left.syllableIndex - right.syllableIndex;
  const leftIndex = left.kind === "binding" ? left.tokenIndex : left.fromTokenIndex;
  const rightIndex = right.kind === "binding" ? right.tokenIndex : right.fromTokenIndex;
  return leftIndex - rightIndex;
}

function occurrenceIdentity(occurrence: RelationOccurrence): string {
  return occurrence.kind === "binding"
    ? stableStringify([
        occurrence.kind,
        occurrence.entryId,
        occurrence.syllableIndex,
        occurrence.tokenIndex,
        occurrence.tokenId,
      ])
    : stableStringify([
        occurrence.kind,
        occurrence.entryId,
        occurrence.syllableIndex,
        occurrence.fromTokenIndex,
        occurrence.fromToken,
        occurrence.toToken,
      ]);
}

function expectedBindingContext(tokenId: TokenId, tokenIndex: number): BindingOccurrence["context"] {
  if (tokenId.startsWith("tone:")) return "tone";
  return tokenIndex === 0 ? "syllable-start" : "within-syllable";
}

function validBindingOccurrence(
  occurrence: BindingOccurrence,
  entry: CatalogEntry,
  relation: Extract<RelationRef, { readonly kind: "binding" }>,
): boolean {
  const syllable = entry.syllables[occurrence.syllableIndex];
  return syllable !== undefined
    && syllable.tokens[occurrence.tokenIndex] === relation.scope.tokenId
    && occurrence.tokenId === relation.scope.tokenId
    && occurrence.context === expectedBindingContext(occurrence.tokenId, occurrence.tokenIndex)
    && occurrence.entryInitial === (occurrence.syllableIndex === 0 && occurrence.tokenIndex === 0);
}

function validTransitionOccurrence(
  occurrence: TransitionOccurrence,
  entry: CatalogEntry,
  relation: Extract<RelationRef, { readonly kind: "transition" }>,
): boolean {
  const syllable = entry.syllables[occurrence.syllableIndex];
  return syllable !== undefined
    && syllable.tokens[occurrence.fromTokenIndex] === relation.scope.fromToken
    && syllable.tokens[occurrence.fromTokenIndex + 1] === relation.scope.toToken
    && occurrence.fromToken === relation.scope.fromToken
    && occurrence.toToken === relation.scope.toToken;
}

function exactOccurrences(
  target: ObjectiveTarget,
  index: CatalogRelationIndex,
): readonly RelationOccurrence[] {
  if (target.relation.kind === "binding") {
    return index.bindingOccurrences[bindingRelationKey(target.relation.scope.tokenId)] ?? [];
  }
  if (target.relation.kind === "transition") {
    return index.transitionOccurrences[
      transitionRelationKey(target.relation.scope.fromToken, target.relation.scope.toToken)
    ] ?? [];
  }
  return [];
}

function sameConfusionRelation(left: ConfusionRelationRef, right: ConfusionRelationRef): boolean {
  return left.scope.mode === right.scope.mode
    && left.scope.layoutId === right.scope.layoutId
    && left.scope.expectedToken === right.scope.expectedToken
    && left.scope.actualToken === right.scope.actualToken;
}

function confusionPool(
  target: ObjectiveTarget,
  index: CatalogRelationIndex,
): ConfusionContrastPool | null {
  if (target.relation.kind !== "confusion") return null;
  return Object.values(index.confusionContrastPools)
    .sort((left, right) => {
      const leftKey = stableStringify(left.relation);
      const rightKey = stableStringify(right.relation);
      return compareText(leftKey, rightKey);
    })
    .find((pool) => sameConfusionRelation(pool.relation, target.relation as ConfusionRelationRef)) ?? null;
}

function hasTrainingBinding(
  index: CatalogRelationIndex,
  entryId: string,
  tokenId: TokenId,
): boolean {
  return (index.bindingOccurrences[bindingRelationKey(tokenId)] ?? [])
    .some((occurrence) => occurrence.entryId === entryId && occurrence.partition === "training");
}

function contrastRequirements(
  target: ObjectiveTarget,
  index: CatalogRelationIndex,
  entryId: string,
): readonly ConfusionContrastRequirement[] {
  if (target.relation.kind !== "confusion") return [];
  const pool = confusionPool(target, index);
  if (pool === null) return [];
  const shared = new Set(pool.sharedEntryIds);
  const roles: ConfusionContrastRequirement[] = [];
  const expectedEligible = (shared.has(entryId) || pool.expectedEntryIds.includes(entryId))
    && hasTrainingBinding(index, entryId, target.relation.scope.expectedToken);
  const actualEligible = (shared.has(entryId) || pool.actualEntryIds.includes(entryId))
    && hasTrainingBinding(index, entryId, target.relation.scope.actualToken);
  if (expectedEligible) {
    roles.push({
      kind: "confusion-contrast",
      relation: target.relation,
      entryId,
      role: "expected",
    });
  }
  if (actualEligible) {
    roles.push({
      kind: "confusion-contrast",
      relation: target.relation,
      entryId,
      role: "actual",
    });
  }
  return roles;
}

function evidenceForEntry(
  target: ObjectiveTarget,
  index: CatalogRelationIndex,
  entry: CatalogEntry,
  exclusions: RetrievalExclusion[],
): TargetEvidence | null {
  if (target.relation.kind === "confusion") {
    const pool = confusionPool(target, index);
    if (pool === null) return null;
    const requirements = contrastRequirements(target, index, entry.id);
    if (requirements.length === 0) return null;
    return {
      targetKey: target.key,
      relation: target.relation,
      exactOccurrences: [],
      contrastRequirements: requirements,
      exposureCount: requirements.length,
    };
  }

  const occurrences = exactOccurrences(target, index)
    .filter((occurrence) => occurrence.entryId === entry.id)
    .sort(compareOccurrence);
  const training: RelationOccurrence[] = [];
  const seenOccurrences = new Set<string>();
  for (const occurrence of occurrences) {
    const identity = occurrenceIdentity(occurrence);
    if (seenOccurrences.has(identity)) {
      exclusions.push({
        entryId: entry.id,
        targetKey: target.key,
        reason: "duplicate-index-occurrence",
        detail: "duplicate relation occurrence was ignored instead of double counted",
      });
      continue;
    }
    seenOccurrences.add(identity);
    if (occurrence.partition !== "training") {
      exclusions.push({
        entryId: entry.id,
        targetKey: target.key,
        reason: "evaluation-partition",
        detail: "objective occurrence belongs to the evaluation partition",
      });
      continue;
    }
    const valid = occurrence.kind === "binding" && target.relation.kind === "binding"
      ? validBindingOccurrence(occurrence, entry, target.relation)
      : occurrence.kind === "transition" && target.relation.kind === "transition"
        ? validTransitionOccurrence(occurrence, entry, target.relation)
        : false;
    if (!valid) {
      exclusions.push({
        entryId: entry.id,
        targetKey: target.key,
        reason: "invalid-index-occurrence",
        detail: "indexed occurrence does not match the catalog syllable path exactly",
      });
      continue;
    }
    training.push(occurrence);
  }
  if (training.length === 0) return null;
  return {
    targetKey: target.key,
    relation: target.relation,
    exactOccurrences: training,
    contrastRequirements: [],
    exposureCount: training.length,
  };
}

export function retrieveCandidates(
  targets: readonly ObjectiveTarget[],
  index: CatalogRelationIndex,
  entries: readonly CatalogEntry[],
): RetrievalResult {
  const exclusions: RetrievalExclusion[] = [];
  const entryMap = new Map<string, CatalogEntry>();
  for (const entry of [...entries].sort((left, right) => compareText(left.id, right.id))) {
    if (entryMap.has(entry.id)) throw new Error(`duplicate catalog entry id: ${entry.id}`);
    entryMap.set(entry.id, entry);
  }

  for (const target of targets) {
    if (target.relation.kind === "confusion" && confusionPool(target, index) === null) {
      exclusions.push({
        entryId: null,
        targetKey: target.key,
        reason: "confusion-pool-missing",
        detail: "no explicit contrast pool matches the directional confusion objective",
      });
    }
    for (const occurrence of exactOccurrences(target, index)) {
      if (!entryMap.has(occurrence.entryId)) {
        exclusions.push({
          entryId: occurrence.entryId,
          targetKey: target.key,
          reason: "missing-catalog-entry",
          detail: "relation index references an entry absent from the supplied catalog",
        });
      }
    }
  }

  const candidates: RetrievalCandidate[] = [];
  for (const entry of entryMap.values()) {
    const targetEvidence = targets
      .map((target) => evidenceForEntry(target, index, entry, exclusions))
      .filter((evidence): evidence is TargetEvidence => evidence !== null)
      .sort((left, right) => compareText(left.targetKey, right.targetKey));
    if (targetEvidence.length === 0) {
      exclusions.push({
        entryId: entry.id,
        targetKey: null,
        reason: "no-exact-support",
        detail: "entry has no exact training occurrence or explicit confusion contrast role",
      });
      continue;
    }
    const tokens = tokenCount(entry);
    if (tokens <= 0 || entry.syllables.length <= 0) {
      exclusions.push({
        entryId: entry.id,
        targetKey: null,
        reason: "invalid-index-occurrence",
        detail: "candidate entry has no traversable token path",
      });
      continue;
    }
    candidates.push({
      entry,
      targetEvidence,
      tokenCount: tokens,
      syllableCount: entry.syllables.length,
      tokenPathSignature: pathSignature(entry),
      commonWord: entry.frequencyBand === 1,
    });
  }

  candidates.sort((left, right) => compareText(left.entry.id, right.entry.id));
  exclusions.sort((left, right) => {
    const leftKey = `${left.entryId ?? ""}\u0000${left.targetKey ?? ""}\u0000${left.reason}\u0000${left.detail}`;
    const rightKey = `${right.entryId ?? ""}\u0000${right.targetKey ?? ""}\u0000${right.reason}\u0000${right.detail}`;
    return compareText(leftKey, rightKey);
  });
  return {
    candidates,
    trace: {
      candidateEntryIds: candidates.map((candidate) => candidate.entry.id),
      exclusions,
    },
  };
}

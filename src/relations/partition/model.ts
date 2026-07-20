import type { CatalogEntry } from "../../core/model.js";
import type { CatalogRelationIndex, RelationOccurrence } from "../types.js";
import type { PartitionInput } from "./types.js";
import { compareText, sortedUnique } from "./utils.js";

export interface PartitionRelationModel {
  readonly bindingKeys: readonly string[];
  readonly transitionKeys: readonly string[];
  readonly relationKeys: readonly string[];
  readonly relationEntryIds: Readonly<Record<string, readonly string[]>>;
  readonly entryRelationKeys: Readonly<Record<string, readonly string[]>>;
}

export interface RelationSupportViolation {
  readonly relationKey: string;
  readonly originalDistinctEntrySupport: number;
  readonly trainingDistinctEntrySupport: number;
  readonly requiredTrainingDistinctEntrySupport: number;
}

export interface EntryPartitionFeatures {
  readonly entryId: string;
  readonly relationKeys: ReadonlySet<string>;
  readonly bindingKeys: ReadonlySet<string>;
  readonly transitionKeys: ReadonlySet<string>;
  readonly tokenIds: ReadonlySet<string>;
  readonly syllablePathKeys: ReadonlySet<string>;
  readonly lexicalCharacters: ReadonlySet<string>;
  readonly tags: ReadonlySet<string>;
  readonly provenanceIds: ReadonlySet<string>;
}

function occurrenceEntryIds(
  occurrences: readonly RelationOccurrence[],
): readonly string[] {
  return sortedUnique(occurrences.map((occurrence) => occurrence.entryId));
}

export function validatePartitionInput(input: PartitionInput): readonly CatalogEntry[] {
  const sortedEntries = [...input.entries].sort((left, right) => compareText(left.id, right.id));
  const seen = new Set<string>();
  for (const entry of sortedEntries) {
    if (seen.has(entry.id)) throw new Error(`duplicate catalog entry id: ${entry.id}`);
    seen.add(entry.id);
  }
  if (input.report.totals.entries !== sortedEntries.length) {
    throw new Error(
      `partition input report contains ${input.report.totals.entries} entries but received ${sortedEntries.length}`,
    );
  }
  const indexedEntryIds = new Set<string>();
  for (const occurrences of [
    ...Object.values(input.index.bindingOccurrences),
    ...Object.values(input.index.transitionOccurrences),
  ]) {
    for (const occurrence of occurrences) indexedEntryIds.add(occurrence.entryId);
  }
  for (const entryId of indexedEntryIds) {
    if (!seen.has(entryId)) throw new Error(`relation index references unknown entry: ${entryId}`);
  }
  return sortedEntries;
}

export function createPartitionRelationModel(
  index: CatalogRelationIndex,
): PartitionRelationModel {
  const bindingKeys = Object.keys(index.bindingOccurrences).sort(compareText);
  const transitionKeys = Object.keys(index.transitionOccurrences).sort(compareText);
  const relationKeys = [...bindingKeys, ...transitionKeys].sort(compareText);
  const relationEntryIds: Record<string, readonly string[]> = {};
  const entryRelations = new Map<string, Set<string>>();

  const register = (key: string, occurrences: readonly RelationOccurrence[]): void => {
    const entryIds = occurrenceEntryIds(occurrences);
    relationEntryIds[key] = entryIds;
    for (const entryId of entryIds) {
      const keys = entryRelations.get(entryId) ?? new Set<string>();
      keys.add(key);
      entryRelations.set(entryId, keys);
    }
  };

  for (const key of bindingKeys) register(key, index.bindingOccurrences[key] ?? []);
  for (const key of transitionKeys) register(key, index.transitionOccurrences[key] ?? []);

  const entryRelationKeys = Object.fromEntries(
    [...entryRelations.entries()]
      .sort(([left], [right]) => compareText(left, right))
      .map(([entryId, keys]) => [entryId, sortedUnique(keys)]),
  );

  return {
    bindingKeys,
    transitionKeys,
    relationKeys,
    relationEntryIds,
    entryRelationKeys,
  };
}

export function requiredTrainingSupport(
  originalDistinctEntrySupport: number,
  minimumTrainingDistinctEntries: number,
): number {
  return Math.min(originalDistinctEntrySupport, minimumTrainingDistinctEntries);
}

export function relationSupportViolations(
  model: PartitionRelationModel,
  evaluationEntryIds: ReadonlySet<string>,
  minimumTrainingDistinctEntries: number,
  relationKeys: readonly string[] = model.relationKeys,
): readonly RelationSupportViolation[] {
  const violations: RelationSupportViolation[] = [];
  for (const relationKey of [...relationKeys].sort(compareText)) {
    const supportingEntryIds = model.relationEntryIds[relationKey] ?? [];
    const trainingSupport = supportingEntryIds.filter(
      (entryId) => !evaluationEntryIds.has(entryId),
    ).length;
    const required = requiredTrainingSupport(
      supportingEntryIds.length,
      minimumTrainingDistinctEntries,
    );
    if (trainingSupport < required) {
      violations.push({
        relationKey,
        originalDistinctEntrySupport: supportingEntryIds.length,
        trainingDistinctEntrySupport: trainingSupport,
        requiredTrainingDistinctEntrySupport: required,
      });
    }
  }
  return violations;
}

export function createEntryFeatures(
  entry: CatalogEntry,
  model: PartitionRelationModel,
): EntryPartitionFeatures {
  const relationKeys = new Set(model.entryRelationKeys[entry.id] ?? []);
  const bindingKeys = new Set(
    [...relationKeys].filter((key) => model.bindingKeys.includes(key)),
  );
  const transitionKeys = new Set(
    [...relationKeys].filter((key) => model.transitionKeys.includes(key)),
  );
  const tokenIds = new Set<string>();
  const syllablePathKeys = new Set<string>();
  for (const syllable of entry.syllables) {
    syllablePathKeys.add(JSON.stringify(syllable.tokens));
    for (const tokenId of syllable.tokens) tokenIds.add(tokenId);
  }
  return {
    entryId: entry.id,
    relationKeys,
    bindingKeys,
    transitionKeys,
    tokenIds,
    syllablePathKeys,
    lexicalCharacters: new Set([...entry.prompt.text]),
    tags: new Set(entry.tags),
    provenanceIds: new Set(entry.provenanceIds),
  };
}

export function createEntryFeatureMap(
  entries: readonly CatalogEntry[],
  model: PartitionRelationModel,
): ReadonlyMap<string, EntryPartitionFeatures> {
  return new Map(
    [...entries]
      .sort((left, right) => compareText(left.id, right.id))
      .map((entry) => [entry.id, createEntryFeatures(entry, model)] as const),
  );
}

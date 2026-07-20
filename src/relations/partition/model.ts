import type { CatalogEntry } from "../../core/model.js";
import {
  createRelationalCatalogReport,
  type RelationalCatalogReport,
} from "../catalog-report.js";
import type {
  CatalogPartition,
  CatalogRelationIndex,
  RelationOccurrence,
} from "../types.js";
import type { PartitionInput } from "./types.js";
import { compareText, fnvDigest, sortedUnique } from "./utils.js";

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

type CanonicalValue =
  | null
  | boolean
  | number
  | string
  | readonly CanonicalValue[]
  | Readonly<Record<string, CanonicalValue>>;

function occurrenceEntryIds(
  occurrences: readonly RelationOccurrence[],
): readonly string[] {
  return sortedUnique(occurrences.map((occurrence) => occurrence.entryId));
}

function lexicalIdentity(entry: CatalogEntry): string {
  return JSON.stringify([
    entry.prompt.text,
    entry.syllables.map((syllable) => syllable.tokens),
  ]);
}

function canonicalize(value: unknown): CanonicalValue {
  if (
    value === null
    || typeof value === "boolean"
    || typeof value === "number"
    || typeof value === "string"
  ) return value;
  if (Array.isArray(value)) {
    return value
      .map(canonicalize)
      .sort((left, right) => compareText(JSON.stringify(left), JSON.stringify(right)));
  }
  if (typeof value === "object") {
    const record = value as Readonly<Record<string, unknown>>;
    return Object.fromEntries(
      Object.keys(record)
        .sort(compareText)
        .map((key) => [key, canonicalize(record[key])]),
    );
  }
  throw new TypeError(`unsupported canonical snapshot value: ${typeof value}`);
}

function canonicalDigest(value: unknown): string {
  return fnvDigest(JSON.stringify(canonicalize(value)));
}

function reportSnapshot(report: RelationalCatalogReport): Omit<
  RelationalCatalogReport,
  "determinismDigest"
> {
  const { determinismDigest: _ignored, ...snapshot } = report;
  return snapshot;
}

function derivePartitionByEntryId(
  index: CatalogRelationIndex,
  seenEntryIds: ReadonlySet<string>,
): Readonly<Record<string, CatalogPartition>> {
  const partitionByEntryId = new Map<string, CatalogPartition>();
  for (const occurrences of [
    ...Object.values(index.bindingOccurrences),
    ...Object.values(index.transitionOccurrences),
  ]) {
    for (const occurrence of occurrences) {
      if (!seenEntryIds.has(occurrence.entryId)) {
        throw new Error(`relation index references unknown entry: ${occurrence.entryId}`);
      }
      const prior = partitionByEntryId.get(occurrence.entryId);
      if (prior !== undefined && prior !== occurrence.partition) {
        throw new Error(
          `relation index contains conflicting partitions for entry: ${occurrence.entryId}`,
        );
      }
      partitionByEntryId.set(occurrence.entryId, occurrence.partition);
    }
  }
  for (const entryId of [...seenEntryIds].sort(compareText)) {
    if (!partitionByEntryId.has(entryId)) {
      throw new Error(`relation index omits catalog entry occurrences: ${entryId}`);
    }
  }
  return Object.fromEntries(
    [...partitionByEntryId.entries()].sort(([left], [right]) => compareText(left, right)),
  );
}

export function validatePartitionInput(input: PartitionInput): readonly CatalogEntry[] {
  const sortedEntries = [...input.entries].sort((left, right) => compareText(left.id, right.id));
  const seenEntryIds = new Set<string>();
  const entryIdByLexicalIdentity = new Map<string, string>();
  for (const entry of sortedEntries) {
    if (seenEntryIds.has(entry.id)) {
      throw new Error(`duplicate catalog entry id: ${entry.id}`);
    }
    seenEntryIds.add(entry.id);
    const identity = lexicalIdentity(entry);
    const priorEntryId = entryIdByLexicalIdentity.get(identity);
    if (priorEntryId !== undefined) {
      throw new Error(
        `duplicate catalog lexical identity: ${priorEntryId} and ${entry.id}`,
      );
    }
    entryIdByLexicalIdentity.set(identity, entry.id);
  }
  if (input.report.totals.entries !== sortedEntries.length) {
    throw new Error(
      `partition input report contains ${input.report.totals.entries} entries but received ${sortedEntries.length}`,
    );
  }

  const partitionByEntryId = derivePartitionByEntryId(input.report.index, seenEntryIds);
  const canonicalReport = createRelationalCatalogReport(sortedEntries, {
    mode: input.report.mode,
    layoutId: input.report.layoutId,
    partitionByEntryId,
  });
  const canonicalIndexDigest = canonicalDigest(canonicalReport.index);
  const receivedIndexDigest = canonicalDigest(input.report.index);
  if (canonicalIndexDigest !== receivedIndexDigest) {
    throw new Error(
      `partition relation index snapshot mismatch: canonical ${canonicalIndexDigest}, received ${receivedIndexDigest}`,
    );
  }
  const canonicalReportDigest = canonicalDigest(reportSnapshot(canonicalReport));
  const receivedReportDigest = canonicalDigest(reportSnapshot(input.report));
  if (canonicalReportDigest !== receivedReportDigest) {
    throw new Error(
      `partition relation report snapshot mismatch: canonical ${canonicalReportDigest}, received ${receivedReportDigest}`,
    );
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

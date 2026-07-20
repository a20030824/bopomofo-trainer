import type { CatalogEntry, PracticeMode } from "../core/model.js";
import type {
  CatalogPartition,
  CatalogRelationIndex,
  ConfusionRelationRef,
  RelationSupportSummary,
} from "./types.js";
import { createCatalogRelationIndex } from "./catalog-index.js";
import { indexCatalogOccurrences } from "./catalog-occurrences.js";
import type { RelationSupportPolicy } from "./support-summary.js";

export interface RelationStateCounts {
  readonly unsupported: number;
  readonly evaluationOnly: number;
  readonly rareOnly: number;
  readonly concentrated: number;
  readonly supported: number;
}

export interface RelationalCatalogTotals {
  readonly entries: number;
  readonly trainingEntries: number;
  readonly evaluationEntries: number;
  readonly syllables: number;
  readonly tokenOccurrences: number;
  readonly transitionOccurrences: number;
  readonly bindingRelations: number;
  readonly observedBindingRelations: number;
  readonly transitionRelations: number;
  readonly observedTransitionRelations: number;
}

export interface RelationalCatalogReport {
  readonly schemaVersion: "relational-catalog-v1";
  readonly mode: PracticeMode;
  readonly layoutId: string;
  readonly analyzedRelationKinds: readonly ["binding", "transition"];
  readonly totals: RelationalCatalogTotals;
  readonly stateCounts: {
    readonly binding: RelationStateCounts;
    readonly transition: RelationStateCounts;
  };
  readonly partitionSupportLossKeys: readonly string[];
  readonly rareOnlyKeys: readonly string[];
  readonly concentratedKeys: readonly string[];
  readonly unsupportedBindingKeys: readonly string[];
  readonly unsupportedTransitionKeys: readonly string[];
  readonly index: CatalogRelationIndex;
  readonly determinismDigest: string;
}

function emptyStateCounts(): RelationStateCounts {
  return {
    unsupported: 0,
    evaluationOnly: 0,
    rareOnly: 0,
    concentrated: 0,
    supported: 0,
  };
}

function incrementState(
  counts: RelationStateCounts,
  state: RelationSupportSummary["supportState"],
): RelationStateCounts {
  if (state === "evaluation-only") {
    return { ...counts, evaluationOnly: counts.evaluationOnly + 1 };
  }
  if (state === "rare-only") {
    return { ...counts, rareOnly: counts.rareOnly + 1 };
  }
  return { ...counts, [state]: counts[state] + 1 };
}

function fnvDigest(source: string): string {
  let digest = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    digest ^= source.charCodeAt(index);
    digest = Math.imul(digest, 16777619);
  }
  return (digest >>> 0).toString(16).padStart(8, "0");
}

export interface RelationalCatalogReportOptions {
  readonly mode: PracticeMode;
  readonly layoutId: string;
  readonly partitionByEntryId: Readonly<Record<string, CatalogPartition>>;
  readonly supportPolicy?: RelationSupportPolicy;
  readonly confusionRelations?: readonly ConfusionRelationRef[];
}

export function createRelationalCatalogReport(
  entries: readonly CatalogEntry[],
  options: RelationalCatalogReportOptions,
): RelationalCatalogReport {
  const occurrences = indexCatalogOccurrences(entries, options.partitionByEntryId);
  const index = createCatalogRelationIndex(entries, options);
  let bindingCounts = emptyStateCounts();
  let transitionCounts = emptyStateCounts();
  const partitionSupportLossKeys: string[] = [];
  const rareOnlyKeys: string[] = [];
  const concentratedKeys: string[] = [];
  const unsupportedBindingKeys: string[] = [];
  const unsupportedTransitionKeys: string[] = [];
  let observedBindingRelations = 0;
  let observedTransitionRelations = 0;

  for (const [key, summary] of Object.entries(index.support)) {
    if (summary.relation.kind === "binding") {
      bindingCounts = incrementState(bindingCounts, summary.supportState);
      if (summary.occurrenceCount > 0) observedBindingRelations += 1;
      if (summary.supportState === "unsupported") unsupportedBindingKeys.push(key);
    } else if (summary.relation.kind === "transition") {
      transitionCounts = incrementState(transitionCounts, summary.supportState);
      if (summary.occurrenceCount > 0) observedTransitionRelations += 1;
      if (summary.supportState === "unsupported") unsupportedTransitionKeys.push(key);
    }
    if (summary.supportState === "evaluation-only") partitionSupportLossKeys.push(key);
    if (summary.supportState === "rare-only") rareOnlyKeys.push(key);
    if (summary.supportState === "concentrated") concentratedKeys.push(key);
  }

  const trainingEntries = entries.filter(
    (entry) => options.partitionByEntryId[entry.id] === "training",
  ).length;
  const evaluationEntries = entries.filter(
    (entry) => options.partitionByEntryId[entry.id] === "evaluation",
  ).length;
  const bindingRelations = Object.values(index.support)
    .filter((summary) => summary.relation.kind === "binding").length;
  const transitionRelations = Object.values(index.support)
    .filter((summary) => summary.relation.kind === "transition").length;

  const base = {
    schemaVersion: "relational-catalog-v1" as const,
    mode: options.mode,
    layoutId: options.layoutId,
    analyzedRelationKinds: ["binding", "transition"] as const,
    totals: {
      entries: entries.length,
      trainingEntries,
      evaluationEntries,
      syllables: occurrences.syllableCount,
      tokenOccurrences: occurrences.tokenCount,
      transitionOccurrences: occurrences.transitionCount,
      bindingRelations,
      observedBindingRelations,
      transitionRelations,
      observedTransitionRelations,
    },
    stateCounts: {
      binding: bindingCounts,
      transition: transitionCounts,
    },
    partitionSupportLossKeys,
    rareOnlyKeys,
    concentratedKeys,
    unsupportedBindingKeys,
    unsupportedTransitionKeys,
    index,
  };

  return {
    ...base,
    determinismDigest: fnvDigest(JSON.stringify(base)),
  };
}

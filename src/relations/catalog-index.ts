import type { CatalogEntry, PracticeMode } from "../core/model.js";
import type {
  CatalogPartition,
  CatalogRelationIndex,
  RelationOccurrence,
  RelationSupportSummary,
} from "./types.js";
import { indexCatalogOccurrences } from "./catalog-occurrences.js";
import { createRelationUniverse } from "./relation-universe.js";
import {
  DEFAULT_RELATION_SUPPORT_POLICY,
  summarizeRelationSupport,
  type RelationSupportPolicy,
} from "./support-summary.js";

export interface CatalogRelationIndexOptions {
  readonly mode: PracticeMode;
  readonly layoutId: string;
  readonly partitionByEntryId: Readonly<Record<string, CatalogPartition>>;
  readonly supportPolicy?: RelationSupportPolicy;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function createCatalogRelationIndex(
  entries: readonly CatalogEntry[],
  options: CatalogRelationIndexOptions,
): CatalogRelationIndex {
  const occurrences = indexCatalogOccurrences(entries, options.partitionByEntryId);
  const universe = createRelationUniverse(options.mode, options.layoutId);
  const supportPolicy = options.supportPolicy ?? DEFAULT_RELATION_SUPPORT_POLICY;
  const support = new Map<string, RelationSupportSummary>();

  for (const [key, relation] of Object.entries(universe.bindings)) {
    support.set(
      key,
      summarizeRelationSupport(
        relation,
        occurrences.bindingOccurrences[key] ?? [],
        supportPolicy,
      ),
    );
  }
  for (const [key, relation] of Object.entries(universe.transitions)) {
    support.set(
      key,
      summarizeRelationSupport(
        relation,
        occurrences.transitionOccurrences[key] ?? [],
        supportPolicy,
      ),
    );
  }

  const sortedSupport = Object.fromEntries(
    [...support.entries()].sort(([left], [right]) => compareText(left, right)),
  );

  return {
    bindingOccurrences: occurrences.bindingOccurrences,
    transitionOccurrences: occurrences.transitionOccurrences,
    support: sortedSupport,
    confusionContrastPools: {},
  };
}

export function relationOccurrences(
  index: CatalogRelationIndex,
  key: string,
): readonly RelationOccurrence[] {
  return index.bindingOccurrences[key]
    ?? index.transitionOccurrences[key]
    ?? [];
}

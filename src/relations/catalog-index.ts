import type { CatalogEntry, PracticeMode } from "../core/model.js";
import type {
  CatalogPartition,
  CatalogRelationIndex,
  ConfusionContrastPool,
  ConfusionRelationRef,
  RelationOccurrence,
  RelationSupportSummary,
} from "./types.js";
import {
  bindingRelationKey,
  indexCatalogOccurrences,
  type CatalogOccurrenceIndex,
} from "./catalog-occurrences.js";
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
  readonly confusionRelations?: readonly ConfusionRelationRef[];
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function confusionRelationKey(relation: ConfusionRelationRef): string {
  return JSON.stringify([
    "confusion",
    relation.scope.mode,
    relation.scope.layoutId,
    relation.scope.expectedToken,
    relation.scope.actualToken,
  ]);
}

function sortedEntryIds(
  occurrences: CatalogOccurrenceIndex,
  tokenId: string,
): readonly string[] {
  return [...new Set(
    (occurrences.bindingOccurrences[bindingRelationKey(tokenId)] ?? [])
      .map((occurrence) => occurrence.entryId),
  )].sort(compareText);
}

function createConfusionContrastPools(
  occurrences: CatalogOccurrenceIndex,
  options: CatalogRelationIndexOptions,
): Readonly<Record<string, ConfusionContrastPool>> {
  const pools = new Map<string, ConfusionContrastPool>();
  const relations = [...(options.confusionRelations ?? [])]
    .sort((left, right) => compareText(confusionRelationKey(left), confusionRelationKey(right)));

  for (const relation of relations) {
    if (relation.scope.mode !== options.mode || relation.scope.layoutId !== options.layoutId) {
      throw new Error("confusion relation mode/layout does not match catalog index scope");
    }
    if (relation.scope.expectedToken === relation.scope.actualToken) {
      throw new Error("confusion relation must use different expected and actual tokens");
    }
    const key = confusionRelationKey(relation);
    if (pools.has(key)) throw new Error(`duplicate confusion relation: ${key}`);

    const expectedEntryIds = sortedEntryIds(occurrences, relation.scope.expectedToken);
    const actualEntryIds = sortedEntryIds(occurrences, relation.scope.actualToken);
    const actualSet = new Set(actualEntryIds);
    const sharedEntryIds = expectedEntryIds.filter((entryId) => actualSet.has(entryId));

    pools.set(key, {
      relation,
      expectedEntryIds,
      actualEntryIds,
      sharedEntryIds,
    });
  }

  return Object.fromEntries(pools);
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
    confusionContrastPools: createConfusionContrastPools(occurrences, options),
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

import type { CatalogEntry } from "../core/model.js";
import { createCatalogSupportIndex } from "../curriculum/support.js";

export interface ProductCatalogPartition {
  readonly practice: readonly CatalogEntry[];
  readonly evaluation: readonly CatalogEntry[];
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function requiredSupport(original: number, minimumPracticeSupport: number): number {
  return Math.min(original, minimumPracticeSupport);
}

export function partitionCatalogForProduct(
  entries: readonly CatalogEntry[],
  evaluationEntryCount = 5,
  minimumPracticeSupport = 3,
): ProductCatalogPartition {
  if (!Number.isInteger(evaluationEntryCount) || evaluationEntryCount <= 0) {
    throw new RangeError("evaluationEntryCount must be a positive integer");
  }
  if (!Number.isInteger(minimumPracticeSupport) || minimumPracticeSupport <= 0) {
    throw new RangeError("minimumPracticeSupport must be a positive integer");
  }
  if (entries.length <= evaluationEntryCount) {
    throw new Error("product catalog requires more practice entries than held-out entries");
  }

  const originalSupport = createCatalogSupportIndex(entries);
  const candidates = [...entries].sort((left, right) =>
    left.frequencyBand - right.frequencyBand || compareText(left.id, right.id),
  );
  const evaluationIds = new Set<string>();

  for (const entry of candidates) {
    if (evaluationIds.size >= evaluationEntryCount) break;
    const proposedIds = new Set(evaluationIds);
    proposedIds.add(entry.id);
    const proposedPractice = entries.filter((candidate) => !proposedIds.has(candidate.id));
    const proposedSupport = createCatalogSupportIndex(proposedPractice);
    const preservesSupport = Object.values(originalSupport.byToken).every((original) => {
      const current = proposedSupport.byToken[original.tokenId];
      return (current?.entryCount ?? 0) >= requiredSupport(
        original.entryCount,
        minimumPracticeSupport,
      ) && (current?.bindingEntryCount ?? 0) >= requiredSupport(
        original.bindingEntryCount,
        minimumPracticeSupport,
      ) && (current?.motorEntryCount ?? 0) >= requiredSupport(
        original.motorEntryCount,
        minimumPracticeSupport,
      );
    });
    if (preservesSupport) evaluationIds.add(entry.id);
  }

  if (evaluationIds.size !== evaluationEntryCount) {
    throw new Error(
      `could only reserve ${evaluationIds.size}/${evaluationEntryCount} held-out entries without reducing required raw, binding, or motor practice support`,
    );
  }

  return {
    practice: entries.filter((entry) => !evaluationIds.has(entry.id)),
    evaluation: entries.filter((entry) => evaluationIds.has(entry.id)),
  };
}

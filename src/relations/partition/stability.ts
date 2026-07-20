import type {
  PartitionDecision,
  PartitionStabilityReport,
} from "./types.js";
import {
  compareText,
  fnvDigest,
  jaccard,
  mean,
  rounded,
  sortedUnique,
} from "./utils.js";

export function comparePartitionStability(
  decisions: readonly PartitionDecision[],
): PartitionStabilityReport {
  if (decisions.length === 0) {
    throw new RangeError("stability comparison requires at least one decision");
  }
  const policyId = decisions[0]!.policyId;
  if (decisions.some((decision) => decision.policyId !== policyId)) {
    throw new Error("stability comparison requires one policy id");
  }
  if (decisions.some((decision) => decision.seed === null)) {
    throw new Error("stability comparison requires seeded decisions");
  }
  const sorted = [...decisions].sort((left, right) =>
    left.seed! - right.seed!
      || compareText(left.metrics.determinismDigest, right.metrics.determinismDigest),
  );
  const pairwise: number[] = [];
  for (let leftIndex = 0; leftIndex < sorted.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < sorted.length; rightIndex += 1) {
      pairwise.push(jaccard(
        new Set(sorted[leftIndex]!.evaluationEntryIds),
        new Set(sorted[rightIndex]!.evaluationEntryIds),
      ));
    }
  }
  const allEntryIds = sortedUnique(
    sorted.flatMap((decision) => decision.evaluationEntryIds),
  );
  const selectionRates = allEntryIds.map((entryId) => {
    const selectedCount = sorted.filter(
      (decision) => decision.evaluationEntryIds.includes(entryId),
    ).length;
    return {
      entryId,
      selectedCount,
      selectionRate: rounded(selectedCount / sorted.length),
    };
  });
  const evaluationSetKeys = sorted.map(
    (decision) => JSON.stringify([...decision.evaluationEntryIds].sort(compareText)),
  );
  const decisionDigests = sorted.map((decision) => fnvDigest(JSON.stringify(decision)));
  const base = {
    policyId,
    seeds: sorted.map((decision) => decision.seed!),
    decisionCount: sorted.length,
    meanPairwiseEvaluationJaccard: pairwise.length === 0
      ? 1
      : rounded(mean(pairwise)),
    minimumPairwiseEvaluationJaccard: pairwise.length === 0
      ? 1
      : rounded(Math.min(...pairwise)),
    uniqueEvaluationSets: new Set(evaluationSetKeys).size,
    selectionRates,
    decisionDigests,
  };
  return {
    ...base,
    determinismDigest: fnvDigest(JSON.stringify(base)),
  };
}

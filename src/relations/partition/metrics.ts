import type { CatalogEntry } from "../../core/model.js";
import { createRelationalCatalogReport } from "../catalog-report.js";
import type { CatalogPartition, RelationSupportSummary } from "../types.js";
import type {
  PartitionConstraintResult,
  PartitionInput,
  PartitionMetrics,
  RelationPartitionCoverageMetrics,
} from "./types.js";
import {
  compareText,
  fnvDigest,
  jaccard,
  mean,
  median,
  rounded,
} from "./utils.js";

function entryTokenSet(entries: readonly CatalogEntry[]): ReadonlySet<string> {
  const result = new Set<string>();
  for (const entry of entries) {
    for (const syllable of entry.syllables) {
      for (const tokenId of syllable.tokens) result.add(tokenId);
    }
  }
  return result;
}

function entryTransitionSet(entries: readonly CatalogEntry[]): ReadonlySet<string> {
  const result = new Set<string>();
  for (const entry of entries) {
    for (const syllable of entry.syllables) {
      for (let index = 0; index + 1 < syllable.tokens.length; index += 1) {
        result.add(JSON.stringify([
          "transition",
          syllable.tokens[index]!,
          syllable.tokens[index + 1]!,
        ]));
      }
    }
  }
  return result;
}

function lexicalCharacterSet(entries: readonly CatalogEntry[]): ReadonlySet<string> {
  return new Set(entries.flatMap((entry) => [...entry.prompt.text]));
}

function tagSet(entries: readonly CatalogEntry[]): ReadonlySet<string> {
  return new Set(entries.flatMap((entry) => entry.tags));
}

function bandDistribution(entries: readonly CatalogEntry[]): readonly [number, number, number] {
  if (entries.length === 0) return [0, 0, 0];
  const counts: [number, number, number] = [0, 0, 0];
  for (const entry of entries) {
    const index = entry.frequencyBand - 1;
    counts[index] = (counts[index] ?? 0) + 1;
  }
  return counts.map((count) => count / entries.length) as [number, number, number];
}

function frequencyBandDivergence(
  training: readonly CatalogEntry[],
  evaluation: readonly CatalogEntry[],
): number {
  if (training.length === 0 && evaluation.length === 0) return 0;
  if (training.length === 0 || evaluation.length === 0) return 1;
  const trainingDistribution = bandDistribution(training);
  const evaluationDistribution = bandDistribution(evaluation);
  return rounded(
    0.5 * trainingDistribution.reduce(
      (total, value, index) => total + Math.abs(value - evaluationDistribution[index]!),
      0,
    ),
  );
}

function relationCoverage(
  summaries: readonly (readonly [string, RelationSupportSummary])[],
): RelationPartitionCoverageMetrics {
  const observed = summaries.filter(([, summary]) => summary.occurrenceCount > 0);
  const evaluationOnlyRelationKeys = observed
    .filter(([, summary]) =>
      summary.trainingDistinctEntryCount === 0
      && summary.evaluationDistinctEntryCount > 0,
    )
    .map(([key]) => key)
    .sort(compareText);
  return {
    observedRelationCount: observed.length,
    trainingCoveredRelationCount: observed.filter(
      ([, summary]) => summary.trainingDistinctEntryCount > 0,
    ).length,
    evaluationCoveredRelationCount: observed.filter(
      ([, summary]) => summary.evaluationDistinctEntryCount > 0,
    ).length,
    evaluationOnlyRelationCount: evaluationOnlyRelationKeys.length,
    evaluationOnlyRelationKeys,
  };
}

export function evaluatePartitionMetrics(
  input: PartitionInput,
  evaluationEntryIds: ReadonlySet<string>,
  constraintResults: readonly PartitionConstraintResult[],
): PartitionMetrics {
  const knownIds = new Set(input.entries.map((entry) => entry.id));
  for (const entryId of evaluationEntryIds) {
    if (!knownIds.has(entryId)) throw new Error(`unknown evaluation entry id: ${entryId}`);
  }
  const training = input.entries
    .filter((entry) => !evaluationEntryIds.has(entry.id))
    .sort((left, right) => compareText(left.id, right.id));
  const evaluation = input.entries
    .filter((entry) => evaluationEntryIds.has(entry.id))
    .sort((left, right) => compareText(left.id, right.id));
  const partitionByEntryId = Object.fromEntries(
    input.entries
      .map((entry) => [
        entry.id,
        evaluationEntryIds.has(entry.id) ? "evaluation" : "training",
      ] as const)
      .sort(([left], [right]) => compareText(left, right)),
  ) as Readonly<Record<string, CatalogPartition>>;
  const report = createRelationalCatalogReport(input.entries, {
    mode: input.report.mode,
    layoutId: input.report.layoutId,
    partitionByEntryId,
  });
  const supportEntries = Object.entries(report.index.support)
    .sort(([left], [right]) => compareText(left, right));
  const bindingSummaries = supportEntries
    .filter(([, summary]) => summary.relation.kind === "binding");
  const transitionSummaries = supportEntries
    .filter(([, summary]) => summary.relation.kind === "transition");
  const observedSummaries = supportEntries
    .map(([, summary]) => summary)
    .filter((summary) => summary.occurrenceCount > 0);
  const trainingSupport = observedSummaries.map(
    (summary) => summary.trainingDistinctEntryCount,
  );
  const trainingConcentrations = observedSummaries
    .filter((summary) => summary.trainingOccurrenceCount > 0)
    .map((summary) => summary.trainingEntryConcentration);

  const tokenOverlap = rounded(jaccard(entryTokenSet(training), entryTokenSet(evaluation)));
  const transitionOverlap = rounded(
    jaccard(entryTransitionSet(training), entryTransitionSet(evaluation)),
  );
  const lexicalCharacterOverlap = rounded(
    jaccard(lexicalCharacterSet(training), lexicalCharacterSet(evaluation)),
  );
  const tagsOverlap = rounded(jaccard(tagSet(training), tagSet(evaluation)));
  const evaluationNovelty = evaluation.length === 0
    ? 0
    : rounded(
      1 - mean([tokenOverlap, transitionOverlap, lexicalCharacterOverlap, tagsOverlap]),
    );
  const bindingCoverage = relationCoverage(bindingSummaries);
  const transitionCoverage = relationCoverage(transitionSummaries);
  const unsatisfiedConstraintIds = constraintResults
    .filter((constraint) => constraint.status === "unsatisfied")
    .map((constraint) => constraint.id)
    .sort(compareText);

  const base = {
    trainingEntryCount: training.length,
    evaluationEntryCount: evaluation.length,
    bindingCoverage,
    transitionCoverage,
    evaluationOnlyRelationCount:
      bindingCoverage.evaluationOnlyRelationCount
      + transitionCoverage.evaluationOnlyRelationCount,
    unsupportedAfterPartitionCount: supportEntries.filter(
      ([, summary]) => summary.supportState === "unsupported",
    ).length,
    trainingDistinctEntrySupport: {
      minimumDistinctEntrySupport: trainingSupport.length === 0
        ? 0
        : Math.min(...trainingSupport),
      medianDistinctEntrySupport: rounded(median(trainingSupport)),
    },
    relationConcentration: {
      meanTrainingOccurrenceConcentration: rounded(mean(trainingConcentrations)),
      maximumTrainingOccurrenceConcentration: trainingConcentrations.length === 0
        ? 0
        : rounded(Math.max(...trainingConcentrations)),
    },
    frequencyBandDivergence: frequencyBandDivergence(training, evaluation),
    tokenOverlap,
    transitionOverlap,
    lexicalCharacterOverlap,
    tagOverlap: tagsOverlap,
    evaluationNovelty,
    unsatisfiedConstraintIds,
  };

  return {
    ...base,
    determinismDigest: fnvDigest(JSON.stringify(base)),
  };
}

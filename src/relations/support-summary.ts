import type {
  FrequencyBandCounts,
  RelationOccurrence,
  RelationRef,
  RelationSupportSummary,
} from "./types.js";

export interface RelationSupportPolicy {
  readonly minimumTrainingEntries: number;
  readonly concentrationThreshold: number;
}

export const DEFAULT_RELATION_SUPPORT_POLICY: RelationSupportPolicy = {
  minimumTrainingEntries: 3,
  concentrationThreshold: 0.5,
};

function concentration(occurrences: readonly RelationOccurrence[]): number {
  if (occurrences.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const occurrence of occurrences) {
    counts.set(occurrence.entryId, (counts.get(occurrence.entryId) ?? 0) + 1);
  }
  return Math.max(...counts.values()) / occurrences.length;
}

function distinctEntryIds(occurrences: readonly RelationOccurrence[]): ReadonlySet<string> {
  return new Set(occurrences.map((occurrence) => occurrence.entryId));
}

function frequencyBandCounts(
  occurrences: readonly RelationOccurrence[],
): FrequencyBandCounts {
  const entryBands = new Map<string, 1 | 2 | 3>();
  for (const occurrence of occurrences) {
    entryBands.set(occurrence.entryId, occurrence.frequencyBand);
  }
  const result = { 1: 0, 2: 0, 3: 0 };
  for (const band of entryBands.values()) result[band] += 1;
  return result;
}

export function summarizeRelationSupport(
  relation: RelationRef,
  occurrences: readonly RelationOccurrence[],
  policy: RelationSupportPolicy = DEFAULT_RELATION_SUPPORT_POLICY,
): RelationSupportSummary {
  const training = occurrences.filter((occurrence) => occurrence.partition === "training");
  const evaluation = occurrences.filter((occurrence) => occurrence.partition === "evaluation");
  const bands = frequencyBandCounts(occurrences);
  const trainingBands = frequencyBandCounts(training);
  const evaluationBands = frequencyBandCounts(evaluation);
  const trainingEntries = distinctEntryIds(training);
  const evaluationEntries = distinctEntryIds(evaluation);
  const trainingConcentration = concentration(training);

  const supportState: RelationSupportSummary["supportState"] =
    occurrences.length === 0
      ? "unsupported"
      : training.length === 0
        ? "evaluation-only"
        : trainingBands[1] === 0
          ? "rare-only"
          : trainingEntries.size < policy.minimumTrainingEntries
            || trainingConcentration > policy.concentrationThreshold
            ? "concentrated"
            : "supported";

  return {
    relation,
    occurrenceCount: occurrences.length,
    distinctEntryCount: distinctEntryIds(occurrences).size,
    frequencyBandCounts: bands,
    commonEntryCount: bands[1],
    entryConcentration: concentration(occurrences),
    trainingOccurrenceCount: training.length,
    trainingDistinctEntryCount: trainingEntries.size,
    trainingCommonEntryCount: trainingBands[1],
    trainingEntryConcentration: trainingConcentration,
    evaluationOccurrenceCount: evaluation.length,
    evaluationDistinctEntryCount: evaluationEntries.size,
    evaluationCommonEntryCount: evaluationBands[1],
    supportState,
  };
}

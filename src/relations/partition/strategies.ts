import type { CatalogEntry } from "../../core/model.js";
import { createPartitionDecision } from "./decision.js";
import {
  selectWithRelationSupportGuard,
  type CandidateScore,
} from "./guarded-selection.js";
import {
  createEntryFeatureMap,
  createPartitionRelationModel,
  validatePartitionInput,
  type EntryPartitionFeatures,
  type PartitionRelationModel,
} from "./model.js";
import type {
  PartitionDecision,
  PartitionInput,
  PartitionPolicyOptions,
} from "./types.js";
import {
  jaccard,
  mean,
  rounded,
  stableSeedTieBreak,
  validatePositiveInteger,
  validateSeed,
} from "./utils.js";

export const DEFAULT_RELATION_PARTITION_OPTIONS: PartitionPolicyOptions = {
  evaluationEntryCount: 5,
  minimumTrainingDistinctEntries: 1,
};

function validateOptions(
  input: PartitionInput,
  options: PartitionPolicyOptions,
): void {
  validatePositiveInteger(options.evaluationEntryCount, "evaluationEntryCount");
  validatePositiveInteger(
    options.minimumTrainingDistinctEntries,
    "minimumTrainingDistinctEntries",
  );
  const entries = validatePartitionInput(input);
  if (entries.length <= options.evaluationEntryCount) {
    throw new RangeError("catalog must contain more entries than the evaluation target");
  }
}

function finalizeGuarded(
  input: PartitionInput,
  options: PartitionPolicyOptions,
  policyId: PartitionDecision["policyId"],
  seed: number | null,
  scorer: (
    entry: CatalogEntry,
    evaluationEntryIds: ReadonlySet<string>,
    model: PartitionRelationModel,
  ) => CandidateScore,
): PartitionDecision {
  validateOptions(input, options);
  const selection = selectWithRelationSupportGuard(
    input,
    options.evaluationEntryCount,
    options.minimumTrainingDistinctEntries,
    scorer,
  );
  return createPartitionDecision(input, {
    policyId,
    seed,
    evaluationEntryIds: selection.evaluationEntryIds,
    evaluationEntryCount: options.evaluationEntryCount,
    minimumTrainingDistinctEntries: options.minimumTrainingDistinctEntries,
    relationSupportConstraintKind: "hard",
    selectionTrace: selection.trace,
    fallbackReasons: [],
    additionalConstraintResults: [],
  });
}

export function partitionRelationSupportPreserving(
  input: PartitionInput,
  options: PartitionPolicyOptions = DEFAULT_RELATION_PARTITION_OPTIONS,
): PartitionDecision {
  return finalizeGuarded(
    input,
    options,
    "relation-support-preserving-v1",
    null,
    (entry, _evaluationEntryIds, model) => ({
      rank: [-entry.frequencyBand, -(model.entryRelationKeys[entry.id]?.length ?? 0)],
      scoreComponents: {
        frequencyBand: entry.frequencyBand,
        relationCount: model.entryRelationKeys[entry.id]?.length ?? 0,
        stableEntryId: entry.id,
      },
      seedTieBreak: null,
    }),
  );
}

function representedRelationKeys(
  evaluationEntryIds: ReadonlySet<string>,
  model: PartitionRelationModel,
): ReadonlySet<string> {
  const represented = new Set<string>();
  for (const entryId of [...evaluationEntryIds].sort()) {
    for (const key of model.entryRelationKeys[entryId] ?? []) represented.add(key);
  }
  return represented;
}

export function partitionSeededMaximumCoverage(
  input: PartitionInput,
  seed: number,
  options: PartitionPolicyOptions = DEFAULT_RELATION_PARTITION_OPTIONS,
): PartitionDecision {
  validateSeed(seed);
  return finalizeGuarded(
    input,
    options,
    "seeded-maximum-coverage-v1",
    seed,
    (entry, evaluationEntryIds, model) => {
      const represented = representedRelationKeys(evaluationEntryIds, model);
      const entryKeys = model.entryRelationKeys[entry.id] ?? [];
      const newBindingCount = entryKeys.filter(
        (key) => model.bindingKeys.includes(key) && !represented.has(key),
      ).length;
      const newTransitionCount = entryKeys.filter(
        (key) => model.transitionKeys.includes(key) && !represented.has(key),
      ).length;
      const totalNewRelationCount = newBindingCount + newTransitionCount;
      const tieBreak = stableSeedTieBreak(seed, entry.id);
      return {
        rank: [
          totalNewRelationCount,
          newTransitionCount,
          newBindingCount,
          -entry.frequencyBand,
        ],
        scoreComponents: {
          newRelationCount: totalNewRelationCount,
          newBindingCount,
          newTransitionCount,
          frequencyBand: entry.frequencyBand,
          stableEntryId: entry.id,
          seedTieBreak: tieBreak,
        },
        seedTieBreak: tieBreak,
      };
    },
  );
}

function unionFeatures(
  selectedEntryIds: ReadonlySet<string>,
  featuresByEntryId: ReadonlyMap<string, EntryPartitionFeatures>,
  key: keyof Pick<
    EntryPartitionFeatures,
    | "transitionKeys"
    | "syllablePathKeys"
    | "lexicalCharacters"
    | "tags"
    | "provenanceIds"
  >,
): ReadonlySet<string> {
  const result = new Set<string>();
  for (const entryId of [...selectedEntryIds].sort()) {
    const features = featuresByEntryId.get(entryId);
    if (features === undefined) continue;
    for (const value of features[key]) result.add(value);
  }
  return result;
}

function countNew(
  candidate: ReadonlySet<string>,
  represented: ReadonlySet<string>,
): number {
  let count = 0;
  for (const value of candidate) {
    if (!represented.has(value)) count += 1;
  }
  return count;
}

export function partitionPathNovelty(
  input: PartitionInput,
  options: PartitionPolicyOptions = DEFAULT_RELATION_PARTITION_OPTIONS,
): PartitionDecision {
  const entries = validatePartitionInput(input);
  const model = createPartitionRelationModel(input.report.index);
  const featuresByEntryId = createEntryFeatureMap(entries, model);
  return finalizeGuarded(
    input,
    options,
    "path-novelty-v1",
    null,
    (entry, evaluationEntryIds) => {
      const candidate = featuresByEntryId.get(entry.id)!;
      const representedTransitions = unionFeatures(
        evaluationEntryIds,
        featuresByEntryId,
        "transitionKeys",
      );
      const representedPaths = unionFeatures(
        evaluationEntryIds,
        featuresByEntryId,
        "syllablePathKeys",
      );
      const representedCharacters = unionFeatures(
        evaluationEntryIds,
        featuresByEntryId,
        "lexicalCharacters",
      );
      const representedTags = unionFeatures(
        evaluationEntryIds,
        featuresByEntryId,
        "tags",
      );
      const representedProvenance = unionFeatures(
        evaluationEntryIds,
        featuresByEntryId,
        "provenanceIds",
      );
      const selectedFeatures = [...evaluationEntryIds]
        .sort()
        .map((entryId) => featuresByEntryId.get(entryId))
        .filter((features): features is EntryPartitionFeatures => features !== undefined);
      const minimumPairwiseNovelty = selectedFeatures.length === 0
        ? 1
        : Math.min(...selectedFeatures.map((selected) => 1 - mean([
          jaccard(candidate.transitionKeys, selected.transitionKeys),
          jaccard(candidate.syllablePathKeys, selected.syllablePathKeys),
          jaccard(candidate.lexicalCharacters, selected.lexicalCharacters),
          jaccard(candidate.tags, selected.tags),
        ])));
      const newTransitionCount = countNew(
        candidate.transitionKeys,
        representedTransitions,
      );
      const newPathCount = countNew(candidate.syllablePathKeys, representedPaths);
      const newCharacterCount = countNew(
        candidate.lexicalCharacters,
        representedCharacters,
      );
      const newTagCount = countNew(candidate.tags, representedTags);
      const newProvenanceCount = countNew(
        candidate.provenanceIds,
        representedProvenance,
      );
      const pairwiseNovelty = rounded(minimumPairwiseNovelty);
      return {
        rank: [
          newPathCount,
          newTransitionCount,
          Math.round(pairwiseNovelty * 1_000_000),
          newCharacterCount,
          newTagCount,
          newProvenanceCount,
          -entry.frequencyBand,
        ],
        scoreComponents: {
          newPathCount,
          newTransitionCount,
          minimumPairwiseNovelty: pairwiseNovelty,
          newCharacterCount,
          newTagCount,
          newProvenanceCount,
          frequencyBand: entry.frequencyBand,
          stableEntryId: entry.id,
        },
        seedTieBreak: null,
      };
    },
  );
}

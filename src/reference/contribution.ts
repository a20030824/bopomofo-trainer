import {
  bindingRelationKey,
  transitionRelationKey,
} from "../relations/catalog-occurrences.js";
import type { RelationalCatalogReport } from "../relations/catalog-report.js";
import type { ReferenceRelationContribution } from "./contribution-types.js";
import type { ReferenceCandidate } from "./types.js";

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function addCount(counts: Map<string, number>, key: string): void {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

export function analyzeReferenceContribution(
  candidate: ReferenceCandidate,
  report: RelationalCatalogReport,
  minimumTrainingEntries = 3,
): ReferenceRelationContribution {
  if (!Number.isInteger(minimumTrainingEntries) || minimumTrainingEntries <= 0) {
    throw new RangeError("minimumTrainingEntries must be a positive integer");
  }

  const counts = new Map<string, number>();
  const bindingKeys = new Set<string>();
  const transitionKeys = new Set<string>();
  const entryInitialBindingKeys = new Set<string>();

  for (let syllableIndex = 0; syllableIndex < candidate.syllables.length; syllableIndex += 1) {
    const syllable = candidate.syllables[syllableIndex]!;
    for (let tokenIndex = 0; tokenIndex < syllable.tokens.length; tokenIndex += 1) {
      const key = bindingRelationKey(syllable.tokens[tokenIndex]!);
      bindingKeys.add(key);
      addCount(counts, key);
      if (syllableIndex === 0 && tokenIndex === 0) entryInitialBindingKeys.add(key);
    }
    for (let index = 0; index + 1 < syllable.tokens.length; index += 1) {
      const key = transitionRelationKey(
        syllable.tokens[index]!,
        syllable.tokens[index + 1]!,
      );
      transitionKeys.add(key);
      addCount(counts, key);
    }
  }

  const partitionRepairBindingKeys: string[] = [];
  const partitionRepairTransitionKeys: string[] = [];
  const rareOnlyBindingKeys: string[] = [];
  const rareOnlyTransitionKeys: string[] = [];
  const concentratedBindingKeys: string[] = [];
  const concentratedTransitionKeys: string[] = [];
  const newObservedBindingKeys: string[] = [];
  const newObservedTransitionKeys: string[] = [];
  let bindingDeficitReduction = 0;
  let transitionDeficitReduction = 0;

  for (const [kind, keys] of [
    ["binding", bindingKeys],
    ["transition", transitionKeys],
  ] as const) {
    for (const key of keys) {
      const summary = report.index.support[key];
      if (summary === undefined || summary.relation.kind !== kind) {
        throw new Error(`candidate relation is outside the report universe: ${key}`);
      }
      const gain = Math.min(
        1,
        Math.max(0, minimumTrainingEntries - summary.trainingDistinctEntryCount),
      );
      if (kind === "binding") {
        bindingDeficitReduction += gain;
        if (summary.supportState === "evaluation-only") partitionRepairBindingKeys.push(key);
        if (summary.supportState === "rare-only") rareOnlyBindingKeys.push(key);
        if (summary.supportState === "concentrated") concentratedBindingKeys.push(key);
        if (summary.supportState === "unsupported") newObservedBindingKeys.push(key);
      } else {
        transitionDeficitReduction += gain;
        if (summary.supportState === "evaluation-only") partitionRepairTransitionKeys.push(key);
        if (summary.supportState === "rare-only") rareOnlyTransitionKeys.push(key);
        if (summary.supportState === "concentrated") concentratedTransitionKeys.push(key);
        if (summary.supportState === "unsupported") newObservedTransitionKeys.push(key);
      }
    }
  }

  const sort = (values: readonly string[]): readonly string[] => [...values].sort(compareText);
  return {
    occurrenceCounts: Object.fromEntries(
      [...counts.entries()].sort(([left], [right]) => compareText(left, right)),
    ),
    bindingKeys: sort(bindingKeys),
    transitionKeys: sort(transitionKeys),
    entryInitialBindingKeys: sort(entryInitialBindingKeys),
    partitionRepairBindingKeys: sort(partitionRepairBindingKeys),
    partitionRepairTransitionKeys: sort(partitionRepairTransitionKeys),
    rareOnlyBindingKeys: sort(rareOnlyBindingKeys),
    rareOnlyTransitionKeys: sort(rareOnlyTransitionKeys),
    concentratedBindingKeys: sort(concentratedBindingKeys),
    concentratedTransitionKeys: sort(concentratedTransitionKeys),
    newObservedBindingKeys: sort(newObservedBindingKeys),
    newObservedTransitionKeys: sort(newObservedTransitionKeys),
    bindingDeficitReduction,
    transitionDeficitReduction,
  };
}

import type { CatalogEntry } from "../../core/model.js";
import { compositionRelationKey } from "../../composition/objective.js";
import { stableDigest, stableStringify } from "../../composition/stable.js";
import type { MeasurementSummary } from "../../measurement/types.js";
import type { RelationalCatalogReport } from "../../relations/catalog-report.js";
import type { CatalogPartition, RelationRef } from "../../relations/types.js";
import type { SyntheticLearnerState } from "../learner/types.js";
import type { RelationalExperimentPlan } from "./types.js";

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function uniqueSortedStrings(name: string, values: readonly string[]): readonly string[] {
  const normalized = values.map((value) => value.trim());
  if (normalized.some((value) => value.length === 0)) {
    throw new Error(`${name} must not contain an empty value`);
  }
  const unique = new Set(normalized);
  if (unique.size !== normalized.length) throw new Error(`${name} must not contain duplicates`);
  return [...unique].sort(compareText);
}

function uniqueSortedSeeds(values: readonly number[]): readonly number[] {
  if (values.length === 0) throw new Error("experiment plan requires at least one seed");
  for (const value of values) {
    if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
      throw new RangeError("experiment seeds must be unsigned 32-bit integers");
    }
  }
  const unique = new Set(values);
  if (unique.size !== values.length) throw new Error("experiment seeds must not contain duplicates");
  return [...unique].sort((left, right) => left - right);
}

function sortedCatalog(entries: readonly CatalogEntry[]): readonly CatalogEntry[] {
  const sorted = [...entries].sort((left, right) => compareText(left.id, right.id));
  const ids = new Set<string>();
  for (const entry of sorted) {
    if (ids.has(entry.id)) throw new Error(`duplicate experiment catalog entry ${entry.id}`);
    ids.add(entry.id);
  }
  if (sorted.length === 0) throw new Error("experiment catalog must not be empty");
  return sorted;
}

export function canonicalizeRelationalExperimentPlan(
  plan: RelationalExperimentPlan,
): RelationalExperimentPlan {
  if (plan.schemaVersion !== "relational-experiment-plan-v1") {
    throw new Error(`unsupported experiment plan version ${plan.schemaVersion}`);
  }
  if (!Number.isInteger(plan.rounds) || plan.rounds <= 0) {
    throw new RangeError("experiment rounds must be a positive integer");
  }
  if (!Number.isFinite(plan.beamWidth) || plan.beamWidth < 1) {
    throw new RangeError("experiment beamWidth must be at least one");
  }
  if (!Number.isFinite(plan.startTimestampMs)
    || !Number.isFinite(plan.roundTimestampStepMs)
    || plan.roundTimestampStepMs <= 0) {
    throw new RangeError("experiment timestamps must be finite with a positive round step");
  }
  return {
    ...plan,
    id: plan.id.trim(),
    catalog: sortedCatalog(plan.catalog),
    confusionRelations: [...plan.confusionRelations].sort((left, right) =>
      compareText(stableStringify(left), stableStringify(right))
    ),
    scenarioIds: uniqueSortedStrings("scenarioIds", plan.scenarioIds),
    seeds: uniqueSortedSeeds(plan.seeds),
  };
}

export function relationalExperimentPlanDigest(plan: RelationalExperimentPlan): string {
  return stableDigest(canonicalizeRelationalExperimentPlan(plan));
}

export function deriveExperimentSeed(...parts: readonly (string | number)[]): number {
  return Number.parseInt(stableDigest(parts), 16) >>> 0;
}

export function emptyMeasurementSummary(policyVersion: string): MeasurementSummary {
  return {
    policyVersion,
    traceCount: 0,
    bindingObservationCount: 0,
    confusionObservationCount: 0,
    transitionObservationCount: 0,
    bindings: {},
    confusions: {},
    transitions: {},
  };
}

export function partitionMap(
  entries: readonly CatalogEntry[],
  evaluationEntryIds: readonly string[],
): Readonly<Record<string, CatalogPartition>> {
  const evaluation = new Set(evaluationEntryIds);
  return Object.fromEntries(entries.map((entry) => [
    entry.id,
    evaluation.has(entry.id) ? "evaluation" : "training",
  ] as const));
}

function maximalRelationKeys(
  values: readonly { readonly relation: RelationRef; readonly weakness: number }[],
): readonly string[] {
  if (values.length === 0) return [];
  const maximum = Math.max(...values.map((item) => item.weakness));
  return values
    .filter((item) => item.weakness === maximum)
    .map((item) => compositionRelationKey(item.relation))
    .sort(compareText);
}

export function hiddenWeaknessRelationKeys(
  learner: SyntheticLearnerState,
  mode: "guided" | "recall",
  layoutId: string,
): readonly string[] {
  const binding = maximalRelationKeys(Object.values(learner.bindings).map((truth) => ({
    relation: {
      kind: "binding" as const,
      scope: { mode, layoutId, tokenId: truth.tokenId },
    },
    weakness: truth.errorProbability,
  })));
  const transition = maximalRelationKeys(Object.values(learner.transitions).map((truth) => ({
    relation: {
      kind: "transition" as const,
      scope: {
        mode,
        layoutId,
        fromToken: truth.fromToken,
        toToken: truth.toToken,
      },
    },
    weakness: truth.latency.meanMs,
  })));
  const confusion = maximalRelationKeys(Object.values(learner.confusions).map((truth) => ({
    relation: {
      kind: "confusion" as const,
      scope: {
        mode,
        layoutId,
        expectedToken: truth.expectedToken,
        actualToken: truth.actualToken,
      },
    },
    weakness: truth.conditionalProbability,
  })));
  return [...new Set([...binding, ...transition, ...confusion])].sort(compareText);
}

export function supportedRelationCount(report: RelationalCatalogReport): number {
  const bindingAndTransition = Object.values(report.index.support)
    .filter((summary) => summary.trainingDistinctEntryCount > 0).length;
  const confusion = Object.values(report.index.confusionContrastPools)
    .filter((pool) => {
      const expected = new Set(
        report.index.bindingOccurrences[JSON.stringify(["binding", pool.relation.scope.expectedToken])]
          ?.filter((item) => item.partition === "training")
          .map((item) => item.entryId) ?? [],
      );
      const actual = new Set(
        report.index.bindingOccurrences[JSON.stringify(["binding", pool.relation.scope.actualToken])]
          ?.filter((item) => item.partition === "training")
          .map((item) => item.entryId) ?? [],
      );
      return expected.size > 0 && actual.size > 0;
    }).length;
  return bindingAndTransition + confusion;
}

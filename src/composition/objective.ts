import type { PracticeMode } from "../core/model.js";
import type { RelationObjective } from "../curriculum/objectives.js";
import type { RelationRef } from "../relations/types.js";
import type { ExposureBudget, FallbackReason, PracticeBudget } from "./types.js";
import { stableStringify } from "./stable.js";

export interface ObjectiveTarget {
  readonly key: string;
  readonly relation: RelationRef;
  readonly exposures: ExposureBudget;
  readonly weight: number;
}

export type ObjectiveResolution =
  | {
      readonly ok: true;
      readonly mode: PracticeMode;
      readonly layoutId: string;
      readonly targets: readonly ObjectiveTarget[];
    }
  | {
      readonly ok: false;
      readonly fallbackReason: FallbackReason;
      readonly detail: string;
    };

export function compositionRelationKey(relation: RelationRef): string {
  switch (relation.kind) {
    case "binding":
      return stableStringify([
        "binding",
        relation.scope.mode,
        relation.scope.layoutId,
        relation.scope.tokenId,
      ]);
    case "transition":
      return stableStringify([
        "transition",
        relation.scope.mode,
        relation.scope.layoutId,
        relation.scope.fromToken,
        relation.scope.toToken,
      ]);
    case "confusion":
      return stableStringify([
        "confusion",
        relation.scope.mode,
        relation.scope.layoutId,
        relation.scope.expectedToken,
        relation.scope.actualToken,
      ]);
  }
}

function validExposureBudget(value: ExposureBudget): boolean {
  return Number.isInteger(value.minimum)
    && Number.isInteger(value.preferred)
    && Number.isInteger(value.maximum)
    && value.minimum >= 0
    && value.minimum <= value.preferred
    && value.preferred <= value.maximum;
}

export function validPracticeBudget(budget: PracticeBudget): boolean {
  return validExposureBudget(budget.targetExposures)
    && Number.isInteger(budget.maximumTokens)
    && budget.maximumTokens >= 0
    && Number.isInteger(budget.maximumSyllables)
    && budget.maximumSyllables >= 0
    && Number.isInteger(budget.maximumLexicalBoundaries)
    && budget.maximumLexicalBoundaries >= 0
    && Number.isFinite(budget.minimumCommonWordShare)
    && budget.minimumCommonWordShare >= 0
    && budget.minimumCommonWordShare <= 1
    && Number.isInteger(budget.maximumSameEntryRepetition)
    && budget.maximumSameEntryRepetition >= 1
    && Number.isFinite(budget.maximumRelationConcentration)
    && budget.maximumRelationConcentration > 0
    && budget.maximumRelationConcentration <= 1
    && Number.isFinite(budget.recentEntryPenalty)
    && budget.recentEntryPenalty >= 0
    && Number.isFinite(budget.recentTokenPathPenalty)
    && budget.recentTokenPathPenalty >= 0
    && Number.isFinite(budget.marginalGainThreshold)
    && budget.marginalGainThreshold >= 0;
}

function target(relation: RelationRef, exposures: ExposureBudget, weight: number): ObjectiveTarget {
  return {
    key: compositionRelationKey(relation),
    relation,
    exposures,
    weight,
  };
}

export function resolveObjective(
  objective: RelationObjective,
  budget: PracticeBudget,
): ObjectiveResolution {
  if (!validPracticeBudget(budget)) {
    return {
      ok: false,
      fallbackReason: "invalid-budget",
      detail: "practice budget failed finite, integer, ordering, or range validation",
    };
  }
  if (objective.kind === "coverage") {
    return {
      ok: false,
      fallbackReason: "coverage-objective-not-composable",
      detail: "coverage objectives do not identify exact relation demands",
    };
  }

  const targets = objective.kind === "combined"
    ? objective.demands.map((demand) => target(
        demand.relation,
        {
          minimum: demand.minimumExposures,
          preferred: demand.preferredExposures,
          maximum: demand.maximumExposures,
        },
        demand.weight,
      ))
    : [target(objective.relation, budget.targetExposures, 1)];

  if (targets.length === 0 || targets.some((item) => !validExposureBudget(item.exposures)
    || !Number.isFinite(item.weight) || item.weight <= 0)) {
    return {
      ok: false,
      fallbackReason: "invalid-budget",
      detail: "combined objective demands require ordered exposure budgets and positive finite weights",
    };
  }

  const first = targets[0]!.relation.scope;
  if (targets.some((item) => item.relation.scope.mode !== first.mode
    || item.relation.scope.layoutId !== first.layoutId)) {
    return {
      ok: false,
      fallbackReason: "inconsistent-objective-scope",
      detail: "all objective relations must share mode and layout",
    };
  }

  const unique = new Map<string, ObjectiveTarget>();
  for (const item of targets) {
    if (unique.has(item.key)) {
      return {
        ok: false,
        fallbackReason: "invalid-budget",
        detail: `duplicate relation demand: ${item.key}`,
      };
    }
    unique.set(item.key, item);
  }

  return {
    ok: true,
    mode: first.mode,
    layoutId: first.layoutId,
    targets: [...unique.values()].sort((left, right) => left.key < right.key ? -1 : left.key > right.key ? 1 : 0),
  };
}

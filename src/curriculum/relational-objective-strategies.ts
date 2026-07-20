import {
  bindingScopeKey,
  confusionScopeKey,
  transitionScopeKey,
} from "../measurement/aggregate.js";
import type { MeasurementSummary } from "../measurement/types.js";
import { compositionRelationKey } from "../composition/objective.js";
import type {
  ObjectiveCandidateScore,
  ObjectiveDecision,
  ObjectiveStrategyId,
  RelationDemand,
  RelationObjective,
} from "./objectives.js";
import type { RelationRef, RelationSupportSummary } from "../relations/types.js";
import type {
  ObjectiveSelectionContext,
  ObjectiveSelectorStrategy,
} from "../simulation/strategy-matrix.js";

interface ScoredRelation {
  readonly relation: RelationRef;
  readonly supportCount: number;
  readonly commonSupportCount: number;
  readonly concentration: number;
  readonly measurementSamples: number;
  readonly measurementValue: number | null;
  readonly score: number;
  readonly reason: string;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function relationKey(relation: RelationRef): string {
  return compositionRelationKey(relation);
}

function isRoundZero(context: ObjectiveSelectionContext): boolean {
  return context.round === 0 && context.measurement.traceCount === 0;
}

function supportReason(
  context: ObjectiveSelectionContext,
  kind: "binding" | "transition" | "confusion",
): string {
  return isRoundZero(context)
    ? `support-driven-round-zero-${kind}`
    : `support-driven-unmeasured-${kind}`;
}

function recentRelationKeys(context: ObjectiveSelectionContext): ReadonlySet<string> {
  const result = new Set<string>();
  for (const objective of context.recentObjectives) {
    if (objective.kind === "coverage") continue;
    if (objective.kind === "combined") {
      for (const demand of objective.demands) result.add(relationKey(demand.relation));
    } else {
      result.add(relationKey(objective.relation));
    }
  }
  return result;
}

function supportedSummaries(
  context: ObjectiveSelectionContext,
  kind: "binding" | "transition",
): readonly RelationSupportSummary[] {
  return Object.values(context.relationReport.index.support)
    .filter((summary) => summary.relation.kind === kind)
    .filter((summary) => summary.trainingDistinctEntryCount > 0)
    .sort((left, right) => compareText(relationKey(left.relation), relationKey(right.relation)));
}

function bindingMeasurement(
  relation: Extract<RelationRef, { readonly kind: "binding" }>,
  measurement: MeasurementSummary,
): { readonly samples: number; readonly value: number | null } {
  const aggregate = measurement.bindings[bindingScopeKey(relation.scope)];
  if (aggregate === undefined || aggregate.attempts === 0) return { samples: 0, value: null };
  return {
    samples: aggregate.attempts,
    value: aggregate.errors / aggregate.attempts,
  };
}

function transitionMeasurement(
  relation: Extract<RelationRef, { readonly kind: "transition" }>,
  measurement: MeasurementSummary,
): { readonly samples: number; readonly value: number | null } {
  const aggregate = measurement.transitions[transitionScopeKey(relation.scope)];
  if (aggregate === undefined) return { samples: 0, value: null };
  return {
    samples: aggregate.timingSamples,
    value: aggregate.currentTimeToTypeMs,
  };
}

function bindingRelations(
  context: ObjectiveSelectionContext,
  mode: "binding" | "frequency",
): readonly ScoredRelation[] {
  const recent = recentRelationKeys(context);
  return supportedSummaries(context, "binding").map((summary) => {
    const relation = summary.relation as Extract<RelationRef, { readonly kind: "binding" }>;
    const measurement = bindingMeasurement(relation, context.measurement);
    const supportScore = summary.trainingCommonEntryCount * 2
      + summary.trainingDistinctEntryCount
      + summary.trainingOccurrenceCount / 1000;
    const baseScore = mode === "frequency"
      ? supportScore
      : measurement.value ?? 1 / Math.max(1, summary.trainingDistinctEntryCount);
    const score = recent.has(relationKey(relation)) ? baseScore * 0.5 : baseScore;
    return {
      relation,
      supportCount: summary.trainingDistinctEntryCount,
      commonSupportCount: summary.trainingCommonEntryCount,
      concentration: summary.trainingEntryConcentration,
      measurementSamples: measurement.samples,
      measurementValue: measurement.value,
      score,
      reason: measurement.value === null
        ? supportReason(context, "binding")
        : mode === "frequency"
          ? "frequency-support-weight"
          : "highest-cumulative-binding-error-rate",
    };
  });
}

function transitionRelations(
  context: ObjectiveSelectionContext,
  mode: "transition" | "frequency",
): readonly ScoredRelation[] {
  const recent = recentRelationKeys(context);
  return supportedSummaries(context, "transition").map((summary) => {
    const relation = summary.relation as Extract<RelationRef, { readonly kind: "transition" }>;
    const measurement = transitionMeasurement(relation, context.measurement);
    const supportScore = summary.trainingCommonEntryCount * 2
      + summary.trainingDistinctEntryCount
      + summary.trainingOccurrenceCount / 1000;
    const baseScore = mode === "frequency"
      ? supportScore
      : measurement.value ?? 1 / Math.max(1, summary.trainingDistinctEntryCount);
    const score = recent.has(relationKey(relation)) ? baseScore * 0.5 : baseScore;
    return {
      relation,
      supportCount: summary.trainingDistinctEntryCount,
      commonSupportCount: summary.trainingCommonEntryCount,
      concentration: summary.trainingEntryConcentration,
      measurementSamples: measurement.samples,
      measurementValue: measurement.value,
      score,
      reason: measurement.value === null
        ? supportReason(context, "transition")
        : mode === "frequency"
          ? "frequency-support-weight"
          : "highest-cumulative-transition-latency",
    };
  });
}

function trainingEntryIdsForToken(
  context: ObjectiveSelectionContext,
  tokenId: string,
): ReadonlySet<string> {
  const result = new Set<string>();
  for (const occurrence of Object.values(context.relationReport.index.bindingOccurrences).flat()) {
    if (occurrence.tokenId === tokenId && occurrence.partition === "training") {
      result.add(occurrence.entryId);
    }
  }
  return result;
}

function confusionRelations(
  context: ObjectiveSelectionContext,
  mode: "confusion" | "frequency",
): readonly ScoredRelation[] {
  const recent = recentRelationKeys(context);
  return Object.values(context.relationReport.index.confusionContrastPools)
    .sort((left, right) => compareText(relationKey(left.relation), relationKey(right.relation)))
    .flatMap((pool): readonly ScoredRelation[] => {
      const expectedTraining = trainingEntryIdsForToken(
        context,
        pool.relation.scope.expectedToken,
      );
      const actualTraining = trainingEntryIdsForToken(
        context,
        pool.relation.scope.actualToken,
      );
      const supportCount = Math.min(expectedTraining.size, actualTraining.size);
      if (supportCount === 0) return [];

      const confusion = context.measurement.confusions[confusionScopeKey(pool.relation.scope)];
      const expectedBinding = context.measurement.bindings[bindingScopeKey({
        mode: pool.relation.scope.mode,
        layoutId: pool.relation.scope.layoutId,
        tokenId: pool.relation.scope.expectedToken,
      })];
      const denominator = expectedBinding?.errors ?? 0;
      const measurementValue = confusion === undefined || denominator === 0
        ? null
        : confusion.occurrences / denominator;
      const sharedTraining = pool.sharedEntryIds.filter(
        (entryId) => expectedTraining.has(entryId) && actualTraining.has(entryId),
      ).length;
      const supportScore = supportCount * 2 + sharedTraining;
      const baseScore = mode === "frequency"
        ? supportScore
        : measurementValue ?? 1 / supportCount;
      const score = recent.has(relationKey(pool.relation)) ? baseScore * 0.5 : baseScore;
      return [{
        relation: pool.relation,
        supportCount,
        commonSupportCount: sharedTraining,
        concentration: sharedTraining === 0 ? 0 : sharedTraining / supportCount,
        measurementSamples: denominator,
        measurementValue,
        score,
        reason: measurementValue === null
          ? supportReason(context, "confusion")
          : mode === "frequency"
            ? "frequency-support-weight"
            : "highest-cumulative-conditional-confusion-rate",
      }];
    });
}

function candidateScore(candidate: ScoredRelation): ObjectiveCandidateScore {
  return {
    relation: candidate.relation,
    eligible: candidate.supportCount > 0,
    score: candidate.score,
    supportCount: candidate.supportCount,
    components: {
      commonSupportCount: candidate.commonSupportCount,
      concentration: candidate.concentration,
      measurementSamples: candidate.measurementSamples,
      measurementValue: candidate.measurementValue,
      finalScore: candidate.score,
    },
    reason: candidate.reason,
  };
}

function ranked(candidates: readonly ScoredRelation[]): readonly ScoredRelation[] {
  return [...candidates].sort((left, right) =>
    right.score - left.score
    || right.supportCount - left.supportCount
    || compareText(relationKey(left.relation), relationKey(right.relation))
  );
}

function emptyDecision(
  kinds: readonly ("binding" | "transition" | "confusion")[],
  reason: string,
): ObjectiveDecision {
  return {
    objective: { kind: "coverage", relationKinds: kinds },
    candidates: [],
    fallbackReason: reason,
  };
}

function singleDecision(
  context: ObjectiveSelectionContext,
  kind: "binding" | "transition" | "confusion",
  candidates: readonly ScoredRelation[],
): ObjectiveDecision {
  const ordered = ranked(candidates);
  const selected = ordered[0];
  if (selected === undefined) return emptyDecision([kind], `no-supported-${kind}-relation`);
  return {
    objective: { kind, relation: selected.relation as never },
    candidates: ordered.map(candidateScore),
    fallbackReason: selected.measurementValue === null
      ? isRoundZero(context)
        ? `round-zero-support-driven-${kind}`
        : `unmeasured-support-driven-${kind}`
      : null,
  };
}

function weightedRandomDecision(context: ObjectiveSelectionContext): ObjectiveDecision {
  const candidates = [
    ...bindingRelations(context, "frequency"),
    ...transitionRelations(context, "frequency"),
    ...confusionRelations(context, "frequency"),
  ].sort((left, right) => compareText(relationKey(left.relation), relationKey(right.relation)));
  if (candidates.length === 0) {
    return emptyDecision(["binding", "transition", "confusion"], "no-supported-relation");
  }
  const total = candidates.reduce((sum, candidate) => sum + candidate.score, 0);
  const random = context.random.next();
  if (!Number.isFinite(random) || random < 0 || random >= 1) {
    throw new RangeError("objective random source must return a finite value in [0, 1)");
  }
  let threshold = random * total;
  let selected = candidates[candidates.length - 1]!;
  for (const candidate of candidates) {
    threshold -= candidate.score;
    if (threshold < 0) {
      selected = candidate;
      break;
    }
  }
  const kind = selected.relation.kind;
  return {
    objective: { kind, relation: selected.relation as never },
    candidates: candidates.map(candidateScore),
    fallbackReason: isRoundZero(context)
      ? "round-zero-frequency-support-sampling"
      : null,
  };
}

function demand(candidate: ScoredRelation, weight: number): RelationDemand {
  return {
    relation: candidate.relation,
    minimumExposures: 1,
    preferredExposures: 1,
    maximumExposures: 2,
    weight,
  };
}

function combinedDecision(context: ObjectiveSelectionContext): ObjectiveDecision {
  const groups = [
    ranked(bindingRelations(context, "binding")),
    ranked(transitionRelations(context, "transition")),
    ranked(confusionRelations(context, "confusion")),
  ];
  const selected = groups.flatMap((group) => group[0] === undefined ? [] : [group[0]]);
  const candidates = groups.flat().sort((left, right) => compareText(
    relationKey(left.relation),
    relationKey(right.relation),
  ));
  if (selected.length === 0) {
    return emptyDecision(["binding", "transition", "confusion"], "no-supported-combined-demand");
  }
  const totalScore = selected.reduce((sum, candidate) => sum + Math.max(candidate.score, 1e-9), 0);
  return {
    objective: {
      kind: "combined",
      demands: selected.map((candidate) => demand(
        candidate,
        Math.max(candidate.score, 1e-9) / totalScore,
      )),
    },
    candidates: candidates.map(candidateScore),
    fallbackReason: selected.some((candidate) => candidate.measurementValue === null)
      ? isRoundZero(context)
        ? "combined-includes-support-driven-round-zero-demand"
        : "combined-includes-unmeasured-support-driven-demand"
      : selected.length < 3
        ? "combined-missing-one-or-more-relation-kinds"
        : null,
  };
}

export function selectRelationalObjective(
  strategyId: ObjectiveStrategyId,
  context: ObjectiveSelectionContext,
): ObjectiveDecision {
  switch (strategyId) {
    case "frequency-random":
      return weightedRandomDecision(context);
    case "binding-only-baseline":
      return singleDecision(context, "binding", bindingRelations(context, "binding"));
    case "transition-aware":
      return singleDecision(context, "transition", transitionRelations(context, "transition"));
    case "confusion-aware":
      return singleDecision(context, "confusion", confusionRelations(context, "confusion"));
    case "combined-relational":
      return combinedDecision(context);
  }
}

export function createRelationalObjectiveStrategy(
  id: ObjectiveStrategyId,
): ObjectiveSelectorStrategy {
  return {
    id,
    select(context) {
      return selectRelationalObjective(id, context);
    },
  };
}

export function createRelationalObjectiveStrategyRegistry(): Readonly<Record<
  ObjectiveStrategyId,
  ObjectiveSelectorStrategy
>> {
  return {
    "frequency-random": createRelationalObjectiveStrategy("frequency-random"),
    "binding-only-baseline": createRelationalObjectiveStrategy("binding-only-baseline"),
    "transition-aware": createRelationalObjectiveStrategy("transition-aware"),
    "confusion-aware": createRelationalObjectiveStrategy("confusion-aware"),
    "combined-relational": createRelationalObjectiveStrategy("combined-relational"),
  };
}

export function objectiveDecisionRelationKeys(decision: ObjectiveDecision): readonly string[] {
  const objective: RelationObjective = decision.objective;
  if (objective.kind === "coverage") return [];
  if (objective.kind === "combined") {
    return objective.demands.map((item) => relationKey(item.relation)).sort(compareText);
  }
  return [relationKey(objective.relation)];
}

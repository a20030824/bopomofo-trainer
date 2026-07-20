import { stableDigest } from "../../composition/stable.js";
import {
  canonicalizeRelationalExperimentPlan,
} from "../experiment/plan.js";
import type { RelationalExperimentPlan } from "../experiment/types.js";
import {
  createRelationalStrategyMatrix,
  relationalStrategyCellId,
} from "../strategy-matrix.js";
import type {
  CanonicalConfirmationCellDeclaration,
  CanonicalRelationalConfirmationPlan,
  ConfirmationCellDeclaration,
  RelationalConfirmationPlan,
} from "./types.js";

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function requiredText(name: string, value: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) throw new Error(`${name} must not be empty`);
  return normalized;
}

function canonicalCell(
  declaration: ConfirmationCellDeclaration,
): CanonicalConfirmationCellDeclaration {
  const hypothesisId = requiredText("confirmation hypothesisId", declaration.hypothesisId);
  const rationale = requiredText("confirmation rationale", declaration.rationale);
  const learnerModelId = requiredText("confirmation learnerModelId", declaration.learnerModelId);
  return {
    ...declaration,
    hypothesisId,
    rationale,
    learnerModelId,
    matchedReferenceCellId: declaration.matchedReferenceCellId === null
      ? null
      : requiredText("matchedReferenceCellId", declaration.matchedReferenceCellId),
    cell: {
      id: relationalStrategyCellId(
        declaration.objectiveStrategyId,
        declaration.partitionPolicyId,
        declaration.compositionStrategyId,
        learnerModelId,
      ),
      objectiveStrategyId: declaration.objectiveStrategyId,
      partitionPolicyId: declaration.partitionPolicyId,
      compositionStrategyId: declaration.compositionStrategyId,
      learnerModelId,
    },
  };
}

function changedAxes(
  cell: CanonicalConfirmationCellDeclaration,
  reference: CanonicalConfirmationCellDeclaration,
): readonly string[] {
  const changes: string[] = [];
  if (cell.cell.objectiveStrategyId !== reference.cell.objectiveStrategyId) changes.push("objective");
  if (cell.cell.partitionPolicyId !== reference.cell.partitionPolicyId) changes.push("partition");
  if (cell.cell.compositionStrategyId !== reference.cell.compositionStrategyId) changes.push("composition");
  if (cell.cell.learnerModelId !== reference.cell.learnerModelId) changes.push("learner");
  return changes;
}

function validateMatchedDeclarations(
  cells: readonly CanonicalConfirmationCellDeclaration[],
  baselineCellId: string,
): void {
  const byId = new Map(cells.map((item) => [item.cell.id, item] as const));
  const baselines = cells.filter((item) => item.role === "historical-baseline");
  if (baselines.length !== 1 || baselines[0]!.cell.id !== baselineCellId) {
    throw new Error("confirmation plan requires exactly the matrix-declared historical baseline");
  }
  if (baselines[0]!.matchedReferenceCellId !== null) {
    throw new Error("historical baseline must not declare a matched reference");
  }

  for (const item of cells) {
    if (item.role === "historical-baseline") continue;
    if (item.matchedReferenceCellId === null) {
      throw new Error(`${item.role} ${item.cell.id} requires a matched reference`);
    }
    const reference = byId.get(item.matchedReferenceCellId);
    if (reference === undefined) {
      throw new Error(`missing matched reference ${item.matchedReferenceCellId}`);
    }
    const changes = changedAxes(item, reference);
    if (item.role === "composer-ablation"
      && (changes.length !== 1 || changes[0] !== "composition")) {
      throw new Error(`composer ablation ${item.cell.id} must change only composition`);
    }
    if (item.role === "transition-diagnostic"
      && (changes.length !== 1 || changes[0] !== "objective"
        || item.cell.objectiveStrategyId !== "transition-aware")) {
      throw new Error(`transition diagnostic ${item.cell.id} must change only objective to transition-aware`);
    }
    if (item.role === "phase-7g-candidate" && item.matchedReferenceCellId !== baselineCellId) {
      throw new Error(`Phase 7G candidate ${item.cell.id} must reference the historical baseline`);
    }
  }
}

export function confirmationExperimentPlan(
  plan: RelationalConfirmationPlan | CanonicalRelationalConfirmationPlan,
): RelationalExperimentPlan {
  return canonicalizeRelationalExperimentPlan({
    schemaVersion: "relational-experiment-plan-v1",
    id: plan.id,
    catalog: plan.catalog,
    confusionRelations: plan.confusionRelations,
    scenarioIds: plan.scenarioIds,
    seeds: plan.seeds,
    rounds: plan.rounds,
    partitionOptions: plan.partitionOptions,
    frequencyAllowCrossBandFallback: plan.frequencyAllowCrossBandFallback,
    practiceBudget: plan.practiceBudget,
    beamWidth: plan.beamWidth,
    startTimestampMs: plan.startTimestampMs,
    roundTimestampStepMs: plan.roundTimestampStepMs,
  });
}

export function canonicalizeRelationalConfirmationPlan(
  input: RelationalConfirmationPlan,
): CanonicalRelationalConfirmationPlan {
  if (input.schemaVersion !== "relational-confirmation-plan-v1") {
    throw new Error(`unsupported confirmation plan version ${input.schemaVersion}`);
  }
  const sourceFindingsPolicyVersion = requiredText(
    "sourceFindingsPolicyVersion",
    input.sourceFindingsPolicyVersion,
  );
  const experiment = confirmationExperimentPlan(input);
  if (input.cells.length === 0) throw new Error("confirmation plan requires selected cells");
  const cells = input.cells.map(canonicalCell).sort((left, right) =>
    compareText(left.cell.id, right.cell.id)
  );
  const ids = new Set<string>();
  const hypotheses = new Set<string>();
  for (const item of cells) {
    if (ids.has(item.cell.id)) throw new Error(`duplicate confirmation cell ${item.cell.id}`);
    if (hypotheses.has(item.hypothesisId)) {
      throw new Error(`duplicate confirmation hypothesis ${item.hypothesisId}`);
    }
    ids.add(item.cell.id);
    hypotheses.add(item.hypothesisId);
  }
  const baselineCellId = createRelationalStrategyMatrix().baselineCellId;
  validateMatchedDeclarations(cells, baselineCellId);
  return {
    schemaVersion: "relational-confirmation-plan-v1",
    id: experiment.id,
    sourceFindingsPolicyVersion,
    catalog: experiment.catalog,
    confusionRelations: experiment.confusionRelations,
    cells,
    scenarioIds: experiment.scenarioIds,
    seeds: experiment.seeds,
    rounds: experiment.rounds,
    partitionOptions: experiment.partitionOptions,
    frequencyAllowCrossBandFallback: experiment.frequencyAllowCrossBandFallback,
    practiceBudget: experiment.practiceBudget,
    beamWidth: experiment.beamWidth,
    startTimestampMs: experiment.startTimestampMs,
    roundTimestampStepMs: experiment.roundTimestampStepMs,
    baselineCellId,
  };
}

export function relationalConfirmationPlanDigest(
  plan: RelationalConfirmationPlan,
): string {
  return stableDigest(canonicalizeRelationalConfirmationPlan(plan));
}

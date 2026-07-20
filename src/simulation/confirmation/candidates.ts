import {
  RELATIONAL_BASELINE_LEARNER_MODEL_ID,
  relationalStrategyCellId,
} from "../strategy-matrix.js";
import type { ConfirmationCellDeclaration } from "./types.js";

export const HISTORICAL_BASELINE_CELL_ID = relationalStrategyCellId(
  "binding-only-baseline",
  "binding-preserving-baseline-v1",
  "fixed-six-baseline",
  RELATIONAL_BASELINE_LEARNER_MODEL_ID,
);

export const ASYMMETRIC_CONFUSION_CANDIDATE_CELL_ID = relationalStrategyCellId(
  "frequency-random",
  "binding-preserving-baseline-v1",
  "fixed-six-baseline",
  RELATIONAL_BASELINE_LEARNER_MODEL_ID,
);

export const WEAK_BINDING_CANDIDATE_CELL_ID = relationalStrategyCellId(
  "binding-only-baseline",
  "relation-support-preserving-v1",
  "fixed-six-baseline",
  RELATIONAL_BASELINE_LEARNER_MODEL_ID,
);

const composerAblations = [
  "greedy-gain-per-token",
  "diversity-aware-greedy",
  "bounded-beam-search",
] as const;

export function createDefaultConfirmationCells(): readonly ConfirmationCellDeclaration[] {
  const cells: ConfirmationCellDeclaration[] = [
    {
      objectiveStrategyId: "binding-only-baseline",
      partitionPolicyId: "binding-preserving-baseline-v1",
      compositionStrategyId: "fixed-six-baseline",
      learnerModelId: RELATIONAL_BASELINE_LEARNER_MODEL_ID,
      role: "historical-baseline",
      hypothesisId: "historical-baseline",
      rationale: "Preserve the matrix-declared historical reference for every confirmatory scenario.",
      anchorScenarioIds: [],
      matchedReferenceCellId: null,
    },
    {
      objectiveStrategyId: "frequency-random",
      partitionPolicyId: "binding-preserving-baseline-v1",
      compositionStrategyId: "fixed-six-baseline",
      learnerModelId: RELATIONAL_BASELINE_LEARNER_MODEL_ID,
      role: "phase-7g-candidate",
      hypothesisId: "phase-7g-asymmetric-confusion-candidate",
      rationale: "Challenge the Phase 7G asymmetric-confusion candidate across longer and noisier cohorts.",
      anchorScenarioIds: ["asymmetric-confusion"],
      matchedReferenceCellId: HISTORICAL_BASELINE_CELL_ID,
    },
    {
      objectiveStrategyId: "binding-only-baseline",
      partitionPolicyId: "relation-support-preserving-v1",
      compositionStrategyId: "fixed-six-baseline",
      learnerModelId: RELATIONAL_BASELINE_LEARNER_MODEL_ID,
      role: "phase-7g-candidate",
      hypothesisId: "phase-7g-weak-binding-candidate",
      rationale: "Challenge the Phase 7G weak-binding candidate across longer and heterogeneous cohorts.",
      anchorScenarioIds: ["weak-binding"],
      matchedReferenceCellId: HISTORICAL_BASELINE_CELL_ID,
    },
  ];

  for (const compositionStrategyId of composerAblations) {
    cells.push({
      objectiveStrategyId: "frequency-random",
      partitionPolicyId: "binding-preserving-baseline-v1",
      compositionStrategyId,
      learnerModelId: RELATIONAL_BASELINE_LEARNER_MODEL_ID,
      role: "composer-ablation",
      hypothesisId: `asymmetric-confusion-composer-ablation:${compositionStrategyId}`,
      rationale: "Hold the asymmetric-confusion candidate objective and partition fixed while replacing fixed-six.",
      anchorScenarioIds: ["asymmetric-confusion"],
      matchedReferenceCellId: ASYMMETRIC_CONFUSION_CANDIDATE_CELL_ID,
    });
    cells.push({
      objectiveStrategyId: "binding-only-baseline",
      partitionPolicyId: "relation-support-preserving-v1",
      compositionStrategyId,
      learnerModelId: RELATIONAL_BASELINE_LEARNER_MODEL_ID,
      role: "composer-ablation",
      hypothesisId: `weak-binding-composer-ablation:${compositionStrategyId}`,
      rationale: "Hold the weak-binding candidate objective and partition fixed while replacing fixed-six.",
      anchorScenarioIds: ["weak-binding"],
      matchedReferenceCellId: WEAK_BINDING_CANDIDATE_CELL_ID,
    });
  }

  cells.push(
    {
      objectiveStrategyId: "transition-aware",
      partitionPolicyId: "binding-preserving-baseline-v1",
      compositionStrategyId: "fixed-six-baseline",
      learnerModelId: RELATIONAL_BASELINE_LEARNER_MODEL_ID,
      role: "transition-diagnostic",
      hypothesisId: "transition-aware-versus-asymmetric-candidate-objective",
      rationale: "Change only the objective relative to the asymmetric-confusion candidate to diagnose objective selection.",
      anchorScenarioIds: ["weak-transition"],
      matchedReferenceCellId: ASYMMETRIC_CONFUSION_CANDIDATE_CELL_ID,
    },
    {
      objectiveStrategyId: "transition-aware",
      partitionPolicyId: "relation-support-preserving-v1",
      compositionStrategyId: "fixed-six-baseline",
      learnerModelId: RELATIONAL_BASELINE_LEARNER_MODEL_ID,
      role: "transition-diagnostic",
      hypothesisId: "transition-aware-versus-weak-binding-candidate-objective",
      rationale: "Change only the objective relative to the weak-binding candidate to diagnose objective selection.",
      anchorScenarioIds: ["weak-transition"],
      matchedReferenceCellId: WEAK_BINDING_CANDIDATE_CELL_ID,
    },
  );

  return cells;
}

import { aggregateMeasurements } from "../../measurement/aggregate.js";
import { stableDigest, stableStringify } from "../../composition/stable.js";
import type { RecentSequenceHistory } from "../../composition/types.js";
import { createSeededRandom } from "../../curriculum/random.js";
import {
  objectiveDecisionRelationKeys,
  createRelationalObjectiveStrategyRegistry,
} from "../../curriculum/relational-objective-strategies.js";
import type { ObjectiveDecision, RelationObjective } from "../../curriculum/objectives.js";
import { createRelationalCatalogReport } from "../../relations/catalog-report.js";
import { getSyntheticScenario } from "../learner/scenarios.js";
import type { RelationalStrategyCell } from "../strategy-matrix.js";
import { cumulativeEstimationError } from "./cumulative-estimate.js";
import { createCompositionStrategyRegistry } from "./composition-adapters.js";
import { createLearnerModelRegistry } from "./learner-adapters.js";
import { calculateRelationalExperimentMetrics } from "./metrics.js";
import { createPartitionStrategyRegistry } from "./partition-adapters.js";
import {
  deriveExperimentSeed,
  emptyMeasurementSummary,
  hiddenWeaknessRelationKeys,
  partitionMap,
  supportedRelationCount,
} from "./plan.js";
import type {
  RelationalExperimentFailure,
  RelationalExperimentPlan,
  RelationalExperimentRoundRecord,
  RelationalExperimentRunRecord,
} from "./types.js";

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function coverageDecision(reason: string): ObjectiveDecision {
  return {
    objective: {
      kind: "coverage",
      relationKinds: ["binding", "transition", "confusion"],
    },
    candidates: [],
    fallbackReason: reason,
  };
}

function historyAfter(
  history: RecentSequenceHistory,
  round: RelationalExperimentRoundRecord,
): RecentSequenceHistory {
  if (round.sequence === null) return history;
  const entryIds = [
    ...history.entryIds,
    ...round.sequence.items.map((item) => item.entry.id),
  ];
  const tokenPathSignatures = [
    ...history.tokenPathSignatures,
    ...round.sequence.items.map((item) =>
      stableStringify(item.entry.syllables.map((syllable) => syllable.tokens))
    ),
  ];
  return { entryIds, tokenPathSignatures };
}

function initialReport(plan: RelationalExperimentPlan) {
  return createRelationalCatalogReport(plan.catalog, {
    mode: "guided",
    layoutId: getSyntheticScenario(plan.scenarioIds[0] as never).layout.id,
    partitionByEntryId: partitionMap(plan.catalog, []),
    confusionRelations: plan.confusionRelations,
  });
}

export function runRelationalExperimentCell(
  plan: RelationalExperimentPlan,
  cell: RelationalStrategyCell,
  scenarioId: string,
  seed: number,
): RelationalExperimentRunRecord {
  const scenario = getSyntheticScenario(scenarioId as never);
  const objectiveRegistry = createRelationalObjectiveStrategyRegistry();
  const partitionRegistry = createPartitionStrategyRegistry(
    plan.frequencyAllowCrossBandFallback,
  );
  const compositionRegistry = createCompositionStrategyRegistry();
  const learnerRegistry = createLearnerModelRegistry();
  const partitionSeed = deriveExperimentSeed(plan.id, cell.id, scenarioId, seed, "partition");
  const allTrainingReport = initialReport({ ...plan, scenarioIds: [scenarioId] });

  let partitionDecision = null;
  let relationReport = allTrainingReport;
  let partitionFailure: RelationalExperimentFailure | null = null;
  try {
    const adapter = partitionRegistry[cell.partitionPolicyId];
    partitionDecision = adapter.partition(
      { entries: plan.catalog, report: allTrainingReport },
      plan.partitionOptions,
      partitionSeed,
    );
    relationReport = createRelationalCatalogReport(plan.catalog, {
      mode: scenario.exercise.mode,
      layoutId: scenario.layout.id,
      partitionByEntryId: partitionMap(
        plan.catalog,
        partitionDecision.evaluationEntryIds,
      ),
      confusionRelations: plan.confusionRelations,
    });
  } catch (error) {
    partitionFailure = {
      round: 0,
      stage: "partition",
      code: "partition-policy-failed",
      detail: errorDetail(error),
    };
  }

  const hiddenWeaknesses = hiddenWeaknessRelationKeys(
    scenario.learner,
    scenario.exercise.mode,
    scenario.layout.id,
  );
  let learner = scenario.learner;
  let measurement = emptyMeasurementSummary(scenario.measurementPolicy.version);
  let history: RecentSequenceHistory = { entryIds: [], tokenPathSignatures: [] };
  let recentObjectives: RelationObjective[] = [];
  const rounds: RelationalExperimentRoundRecord[] = [];

  for (let round = 0; round < plan.rounds; round += 1) {
    const learnerBefore = learner;
    const failures: RelationalExperimentFailure[] = [];
    if (partitionFailure !== null) failures.push({ ...partitionFailure, round });

    let objectiveDecision = coverageDecision("partition-unavailable");
    if (partitionFailure === null) {
      try {
        objectiveDecision = objectiveRegistry[cell.objectiveStrategyId].select({
          round,
          mode: scenario.exercise.mode,
          layoutId: scenario.layout.id,
          relationReport,
          measurement,
          recentObjectives,
          random: createSeededRandom(deriveExperimentSeed(
            plan.id,
            cell.id,
            scenarioId,
            seed,
            round,
            "objective",
          )),
        });
      } catch (error) {
        objectiveDecision = coverageDecision("objective-selector-failed");
        failures.push({
          round,
          stage: "objective",
          code: "objective-selector-failed",
          detail: errorDetail(error),
        });
      }
    }

    let sequence = null;
    if (objectiveDecision.objective.kind !== "coverage") {
      try {
        sequence = compositionRegistry[cell.compositionStrategyId].compose({
          objective: objectiveDecision.objective,
          relationIndex: relationReport.index,
          entries: plan.catalog,
          history,
          budget: plan.practiceBudget,
          beamWidth: plan.beamWidth,
          random: createSeededRandom(deriveExperimentSeed(
            plan.id,
            cell.id,
            scenarioId,
            seed,
            round,
            "composition",
          )),
        });
        if (sequence.items.length === 0 || sequence.mode === null || sequence.layoutId === null) {
          failures.push({
            round,
            stage: "composition",
            code: sequence.stopReason,
            detail: "composer returned no executable practice entries",
          });
        }
      } catch (error) {
        failures.push({
          round,
          stage: "composition",
          code: "composer-failed",
          detail: errorDetail(error),
        });
      }
    } else if (partitionFailure === null) {
      failures.push({
        round,
        stage: "objective",
        code: objectiveDecision.fallbackReason ?? "no-explicit-objective",
        detail: "objective selector returned no explicit relation demand",
      });
    }

    let learnerBatch = null;
    if (sequence !== null
      && sequence.items.length > 0
      && sequence.mode !== null
      && sequence.layoutId !== null) {
      try {
        learnerBatch = learnerRegistry[cell.learnerModelId]!.run({
          sequence,
          learner,
          layout: scenario.layout,
          measurementPolicy: scenario.measurementPolicy,
          scenarioId,
          seed: deriveExperimentSeed(
            plan.id,
            cell.id,
            scenarioId,
            seed,
            round,
            "learner",
          ),
          startedAtMs: plan.startTimestampMs + round * plan.roundTimestampStepMs,
          retentionSteps: scenario.retentionSteps,
        });
        measurement = aggregateMeasurements(
          learnerBatch.measurementEstimate.decisions,
          scenario.measurementPolicy,
          measurement,
        );
        learner = learnerBatch.afterTruth.state;
      } catch (error) {
        failures.push({
          round,
          stage: "learner",
          code: "learner-model-failed",
          detail: errorDetail(error),
        });
      }
    }

    const record: RelationalExperimentRoundRecord = {
      round,
      objectiveDecision,
      objectiveRelationKeys: objectiveDecisionRelationKeys(objectiveDecision),
      sequence,
      learnerBatch,
      cumulativeMeasurement: measurement,
      cumulativeEstimationError: cumulativeEstimationError(learnerBefore, measurement),
      learnerBefore,
      learnerAfter: learner,
      failures,
    };
    rounds.push(record);
    history = historyAfter(history, record);
    if (objectiveDecision.objective.kind !== "coverage") {
      recentObjectives = [...recentObjectives, objectiveDecision.objective];
    }
  }

  const fallbackCount = rounds.filter((round) =>
    round.objectiveDecision.fallbackReason !== null
    || (round.sequence?.fallbackReasons.length ?? 0) > 0
  ).length;
  const failureCount = rounds.reduce((sum, round) => sum + round.failures.length, 0);
  const id = stableStringify(["experiment-run", cell.id, scenarioId, seed]);
  const body = {
    id,
    cell,
    scenarioId,
    seed,
    partitionDecision,
    relationReport,
    hiddenWeaknessRelationKeys: hiddenWeaknesses,
    rounds,
    finalMeasurement: measurement,
    finalLearner: learner,
    metrics: calculateRelationalExperimentMetrics(
      rounds,
      hiddenWeaknesses,
      supportedRelationCount(relationReport),
      scenario.learner,
      learner,
    ),
    fallbackCount,
    failureCount,
  };

  return {
    ...body,
    determinismDigest: stableDigest(body),
  };
}

export function compareExperimentRuns(
  left: RelationalExperimentRunRecord,
  right: RelationalExperimentRunRecord,
): number {
  return compareText(left.cell.id, right.cell.id)
    || compareText(left.scenarioId, right.scenarioId)
    || left.seed - right.seed;
}

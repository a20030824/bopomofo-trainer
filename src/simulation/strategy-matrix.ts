import type {
  InputLayout,
  PracticeMode,
  RandomSource,
} from "../core/model.js";
import type {
  CompositionInput,
  CompositionStrategyId,
  PracticeSequence,
} from "../composition/types.js";
import { stableDigest, stableStringify } from "../composition/stable.js";
import type {
  ObjectiveDecision,
  ObjectiveStrategyId,
  RelationObjective,
} from "../curriculum/objectives.js";
import type {
  MeasurementPolicy,
  MeasurementSummary,
} from "../measurement/types.js";
import type { RelationalCatalogReport } from "../relations/catalog-report.js";
import type {
  PartitionDecision,
  PartitionInput,
  PartitionPolicyId,
  PartitionPolicyOptions,
} from "../relations/partition/types.js";
import type {
  SyntheticLearnerState,
  SyntheticTraceBatch,
} from "./learner/types.js";

export const RELATIONAL_OBJECTIVE_STRATEGY_IDS = [
  "frequency-random",
  "binding-only-baseline",
  "transition-aware",
  "confusion-aware",
  "combined-relational",
] as const satisfies readonly ObjectiveStrategyId[];

export const RELATIONAL_PARTITION_POLICY_IDS = [
  "binding-preserving-baseline-v1",
  "relation-support-preserving-v1",
  "frequency-stratified-v1",
  "seeded-maximum-coverage-v1",
  "path-novelty-v1",
] as const satisfies readonly PartitionPolicyId[];

export const RELATIONAL_COMPOSITION_STRATEGY_IDS = [
  "fixed-six-baseline",
  "greedy-marginal-gain",
  "greedy-gain-per-token",
  "diversity-aware-greedy",
  "bounded-beam-search",
] as const satisfies readonly CompositionStrategyId[];

export const RELATIONAL_BASELINE_LEARNER_MODEL_ID = "synthetic-relational-v1" as const;

export const RELATIONAL_LEARNER_MODEL_IDS = [
  RELATIONAL_BASELINE_LEARNER_MODEL_ID,
] as const;

export type RelationalLearnerModelId = (typeof RELATIONAL_LEARNER_MODEL_IDS)[number] | string;

export interface ObjectiveSelectionContext {
  readonly round: number;
  readonly mode: PracticeMode;
  readonly layoutId: string;
  readonly relationReport: RelationalCatalogReport;
  readonly measurement: MeasurementSummary;
  readonly recentObjectives: readonly RelationObjective[];
  readonly random: RandomSource;
}

export interface ObjectiveSelectorStrategy {
  readonly id: ObjectiveStrategyId;
  select(context: ObjectiveSelectionContext): ObjectiveDecision;
}

export interface PartitionSelectorStrategy<
  Options extends PartitionPolicyOptions = PartitionPolicyOptions,
> {
  readonly id: PartitionPolicyId;
  partition(
    input: PartitionInput,
    options: Options,
    seed: number,
  ): PartitionDecision;
}

export type StrategyCompositionInput = Omit<CompositionInput, "policy"> & {
  readonly beamWidth: number;
};

export interface PracticeComposerStrategy {
  readonly id: CompositionStrategyId;
  compose(input: StrategyCompositionInput): PracticeSequence;
}

export interface LearnerRunInput {
  readonly sequence: PracticeSequence;
  readonly learner: SyntheticLearnerState;
  readonly layout: InputLayout;
  readonly measurementPolicy: MeasurementPolicy;
  readonly scenarioId: string;
  readonly seed: number;
  readonly startedAtMs: number;
  readonly retentionSteps: number;
}

export interface LearnerModelStrategy {
  readonly id: RelationalLearnerModelId;
  run(input: LearnerRunInput): SyntheticTraceBatch;
}

export interface RelationalStrategyCell {
  readonly id: string;
  readonly objectiveStrategyId: ObjectiveStrategyId;
  readonly partitionPolicyId: PartitionPolicyId;
  readonly compositionStrategyId: CompositionStrategyId;
  readonly learnerModelId: RelationalLearnerModelId;
}

export interface RelationalStrategyAxes {
  readonly objectiveStrategyIds: readonly ObjectiveStrategyId[];
  readonly partitionPolicyIds: readonly PartitionPolicyId[];
  readonly compositionStrategyIds: readonly CompositionStrategyId[];
  readonly learnerModelIds: readonly RelationalLearnerModelId[];
}

export interface RelationalStrategyMatrix {
  readonly schemaVersion: "relational-strategy-matrix-v1";
  readonly purpose: "declaration-only";
  readonly executionBoundary: "experiment-harness-required";
  readonly axes: RelationalStrategyAxes;
  readonly baselineCellId: string;
  readonly cells: readonly RelationalStrategyCell[];
  readonly determinismDigest: string;
}

export interface RelationalStrategyMatrixOptions {
  readonly objectiveStrategyIds?: readonly ObjectiveStrategyId[];
  readonly partitionPolicyIds?: readonly PartitionPolicyId[];
  readonly compositionStrategyIds?: readonly CompositionStrategyId[];
  readonly learnerModelIds?: readonly RelationalLearnerModelId[];
}

const OBJECTIVE_ORDER = new Map(
  RELATIONAL_OBJECTIVE_STRATEGY_IDS.map((id, index) => [id, index] as const),
);
const PARTITION_ORDER = new Map(
  RELATIONAL_PARTITION_POLICY_IDS.map((id, index) => [id, index] as const),
);
const COMPOSITION_ORDER = new Map(
  RELATIONAL_COMPOSITION_STRATEGY_IDS.map((id, index) => [id, index] as const),
);

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function orderedKnownIds<T extends string>(
  name: string,
  values: readonly T[],
  allowedOrder: ReadonlyMap<T, number>,
): readonly T[] {
  if (values.length === 0) throw new Error(`${name} must contain at least one strategy`);
  const unique = new Set<T>();
  for (const value of values) {
    if (!allowedOrder.has(value)) throw new Error(`${name} contains unknown strategy ${value}`);
    if (unique.has(value)) throw new Error(`${name} contains duplicate strategy ${value}`);
    unique.add(value);
  }
  return [...unique].sort((left, right) =>
    (allowedOrder.get(left) ?? Number.MAX_SAFE_INTEGER)
    - (allowedOrder.get(right) ?? Number.MAX_SAFE_INTEGER)
  );
}

function orderedLearnerIds(values: readonly RelationalLearnerModelId[]): readonly RelationalLearnerModelId[] {
  if (values.length === 0) throw new Error("learnerModelIds must contain at least one model");
  const normalized = values.map((value) => value.trim());
  if (normalized.some((value) => value.length === 0)) {
    throw new Error("learnerModelIds must not contain an empty model id");
  }
  const unique = new Set(normalized);
  if (unique.size !== normalized.length) {
    throw new Error("learnerModelIds must not contain duplicate model ids");
  }
  return [...unique].sort(compareText);
}

export function relationalStrategyCellId(
  objectiveStrategyId: ObjectiveStrategyId,
  partitionPolicyId: PartitionPolicyId,
  compositionStrategyId: CompositionStrategyId,
  learnerModelId: RelationalLearnerModelId,
): string {
  return stableStringify([
    "strategy-cell",
    objectiveStrategyId,
    partitionPolicyId,
    compositionStrategyId,
    learnerModelId,
  ]);
}

function matrixBody(options: RelationalStrategyMatrixOptions = {}) {
  const objectiveStrategyIds = orderedKnownIds(
    "objectiveStrategyIds",
    options.objectiveStrategyIds ?? RELATIONAL_OBJECTIVE_STRATEGY_IDS,
    OBJECTIVE_ORDER,
  );
  const partitionPolicyIds = orderedKnownIds(
    "partitionPolicyIds",
    options.partitionPolicyIds ?? RELATIONAL_PARTITION_POLICY_IDS,
    PARTITION_ORDER,
  );
  const compositionStrategyIds = orderedKnownIds(
    "compositionStrategyIds",
    options.compositionStrategyIds ?? RELATIONAL_COMPOSITION_STRATEGY_IDS,
    COMPOSITION_ORDER,
  );
  const learnerModelIds = orderedLearnerIds(
    options.learnerModelIds ?? RELATIONAL_LEARNER_MODEL_IDS,
  );

  const cells: RelationalStrategyCell[] = [];
  for (const objectiveStrategyId of objectiveStrategyIds) {
    for (const partitionPolicyId of partitionPolicyIds) {
      for (const compositionStrategyId of compositionStrategyIds) {
        for (const learnerModelId of learnerModelIds) {
          cells.push({
            id: relationalStrategyCellId(
              objectiveStrategyId,
              partitionPolicyId,
              compositionStrategyId,
              learnerModelId,
            ),
            objectiveStrategyId,
            partitionPolicyId,
            compositionStrategyId,
            learnerModelId,
          });
        }
      }
    }
  }

  const baselineCellId = relationalStrategyCellId(
    "binding-only-baseline",
    "binding-preserving-baseline-v1",
    "fixed-six-baseline",
    RELATIONAL_BASELINE_LEARNER_MODEL_ID,
  );

  return {
    schemaVersion: "relational-strategy-matrix-v1" as const,
    purpose: "declaration-only" as const,
    executionBoundary: "experiment-harness-required" as const,
    axes: {
      objectiveStrategyIds,
      partitionPolicyIds,
      compositionStrategyIds,
      learnerModelIds,
    },
    baselineCellId,
    cells,
  };
}

export function createRelationalStrategyMatrix(
  options: RelationalStrategyMatrixOptions = {},
): RelationalStrategyMatrix {
  const body = matrixBody(options);
  if (!body.cells.some((cell) => cell.id === body.baselineCellId)) {
    throw new Error("strategy matrix options exclude the required baseline cell");
  }
  return {
    ...body,
    determinismDigest: stableDigest(body),
  };
}

export function serializeRelationalStrategyMatrix(matrix: RelationalStrategyMatrix): string {
  return `${stableStringify(matrix)}\n`;
}

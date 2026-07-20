import {
  createPartitionRelationModel,
  relationSupportViolations,
  validatePartitionInput,
} from "./model.js";
import { evaluatePartitionMetrics } from "./metrics.js";
import type {
  PartitionConstraintKind,
  PartitionConstraintResult,
  PartitionDecision,
  PartitionFallbackReason,
  PartitionInput,
  PartitionPolicyId,
  PartitionSelectionTrace,
} from "./types.js";
import { compareText, sortedUnique } from "./utils.js";

export interface PartitionDecisionDraft {
  readonly policyId: PartitionPolicyId;
  readonly seed: number | null;
  readonly evaluationEntryIds: ReadonlySet<string>;
  readonly evaluationEntryCount: number;
  readonly minimumTrainingDistinctEntries: number;
  readonly relationSupportConstraintKind: PartitionConstraintKind;
  readonly selectionTrace: readonly PartitionSelectionTrace[];
  readonly fallbackReasons: readonly PartitionFallbackReason[];
  readonly additionalConstraintResults: readonly PartitionConstraintResult[];
}

function constraint(
  id: string,
  kind: PartitionConstraintKind,
  satisfied: boolean,
  reasonCode: string,
  actual: number,
  expectedOperator: PartitionConstraintResult["expectedOperator"],
  expected: number,
  relatedEntryIds: readonly string[] = [],
  relatedRelationKeys: readonly string[] = [],
): PartitionConstraintResult {
  return {
    id,
    kind,
    status: satisfied ? "satisfied" : "unsatisfied",
    reasonCode,
    actual,
    expectedOperator,
    expected,
    relatedEntryIds: sortedUnique(relatedEntryIds),
    relatedRelationKeys: sortedUnique(relatedRelationKeys),
  };
}

function compareConstraints(
  left: PartitionConstraintResult,
  right: PartitionConstraintResult,
): number {
  return compareText(left.id, right.id);
}

function compareFallbacks(
  left: PartitionFallbackReason,
  right: PartitionFallbackReason,
): number {
  return compareText(left.code, right.code)
    || compareText(left.constraintId, right.constraintId)
    || compareText(left.message, right.message);
}

export function createPartitionDecision(
  input: PartitionInput,
  draft: PartitionDecisionDraft,
): PartitionDecision {
  const entries = validatePartitionInput(input);
  const knownIds = new Set(entries.map((entry) => entry.id));
  for (const entryId of draft.evaluationEntryIds) {
    if (!knownIds.has(entryId)) throw new Error(`unknown evaluation entry id: ${entryId}`);
  }
  const evaluationEntryIds = sortedUnique(draft.evaluationEntryIds);
  const evaluationSet = new Set(evaluationEntryIds);
  const trainingEntryIds = entries
    .filter((entry) => !evaluationSet.has(entry.id))
    .map((entry) => entry.id);
  const model = createPartitionRelationModel(input.index);
  const supportViolations = relationSupportViolations(
    model,
    evaluationSet,
    draft.minimumTrainingDistinctEntries,
  );
  const standardConstraints: PartitionConstraintResult[] = [
    constraint(
      "partition-complete",
      "hard",
      trainingEntryIds.length + evaluationEntryIds.length === entries.length,
      "all-entries-assigned-once",
      trainingEntryIds.length + evaluationEntryIds.length,
      "equal",
      entries.length,
    ),
    constraint(
      "partition-disjoint",
      "hard",
      trainingEntryIds.every((entryId) => !evaluationSet.has(entryId)),
      "training-evaluation-disjoint",
      trainingEntryIds.filter((entryId) => evaluationSet.has(entryId)).length,
      "equal",
      0,
    ),
    constraint(
      "evaluation-entry-count",
      "hard",
      evaluationEntryIds.length === draft.evaluationEntryCount,
      evaluationEntryIds.length === draft.evaluationEntryCount
        ? "evaluation-target-satisfied"
        : "evaluation-target-unmet",
      evaluationEntryIds.length,
      "equal",
      draft.evaluationEntryCount,
      evaluationEntryIds,
    ),
    constraint(
      "relation-training-support",
      draft.relationSupportConstraintKind,
      supportViolations.length === 0,
      supportViolations.length === 0
        ? "minimum-distinct-training-support-preserved"
        : "minimum-distinct-training-support-lost",
      supportViolations.length,
      "equal",
      0,
      [],
      supportViolations.map((violation) => violation.relationKey),
    ),
  ];
  const constraints = [
    ...standardConstraints,
    ...draft.additionalConstraintResults,
  ].sort(compareConstraints);
  const fallbackReasons = [...draft.fallbackReasons];
  if (evaluationEntryIds.length !== draft.evaluationEntryCount
    && !fallbackReasons.some((reason) => reason.code === "evaluation-target-unmet")) {
    fallbackReasons.push({
      code: "evaluation-target-unmet",
      constraintId: "evaluation-entry-count",
      message:
        `selected ${evaluationEntryIds.length}/${draft.evaluationEntryCount} evaluation entries without weakening hard constraints`,
      relatedEntryIds: evaluationEntryIds,
      relatedRelationKeys: supportViolations.map((violation) => violation.relationKey),
    });
  }
  const sortedFallbacks = fallbackReasons.sort(compareFallbacks);
  const metrics = evaluatePartitionMetrics(input, evaluationSet, constraints);

  return {
    trainingEntryIds,
    evaluationEntryIds,
    policyId: draft.policyId,
    seed: draft.seed,
    metrics,
    constraintResults: constraints,
    selectionTrace: [...draft.selectionTrace],
    fallbackReasons: sortedFallbacks,
  };
}

export function numericConstraint(
  id: string,
  kind: PartitionConstraintKind,
  actual: number,
  expectedOperator: PartitionConstraintResult["expectedOperator"],
  expected: number,
  reasonCode: string,
  relatedEntryIds: readonly string[] = [],
  relatedRelationKeys: readonly string[] = [],
): PartitionConstraintResult {
  const satisfied = expectedOperator === "equal"
    ? actual === expected
    : expectedOperator === "at-least"
      ? actual >= expected
      : actual <= expected;
  return constraint(
    id,
    kind,
    satisfied,
    reasonCode,
    actual,
    expectedOperator,
    expected,
    relatedEntryIds,
    relatedRelationKeys,
  );
}

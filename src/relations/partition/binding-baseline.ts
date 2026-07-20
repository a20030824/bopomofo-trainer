import { bindingRelationKey } from "../catalog-occurrences.js";
import { createCatalogSupportIndex } from "../../curriculum/support.js";
import { createPartitionDecision, numericConstraint } from "./decision.js";
import type {
  PartitionDecision,
  PartitionInput,
  PartitionPolicyOptions,
  PartitionSelectionTrace,
} from "./types.js";
import {
  compareText,
  sortedUnique,
  validatePositiveInteger,
} from "./utils.js";
import { validatePartitionInput } from "./model.js";

export const DEFAULT_BINDING_BASELINE_OPTIONS: PartitionPolicyOptions = {
  evaluationEntryCount: 5,
  minimumTrainingDistinctEntries: 3,
};

interface TokenContextViolation {
  readonly tokenId: string;
  readonly contexts: readonly string[];
}

function requiredSupport(original: number, minimum: number): number {
  return Math.min(original, minimum);
}

function tokenContextViolations(
  original: ReturnType<typeof createCatalogSupportIndex>,
  current: ReturnType<typeof createCatalogSupportIndex>,
  minimumTrainingDistinctEntries: number,
): readonly TokenContextViolation[] {
  const violations: TokenContextViolation[] = [];
  for (const tokenId of Object.keys(original.byToken).sort(compareText)) {
    const before = original.byToken[tokenId]!;
    const after = current.byToken[tokenId];
    const contexts: string[] = [];
    if ((after?.entryCount ?? 0) < requiredSupport(
      before.entryCount,
      minimumTrainingDistinctEntries,
    )) contexts.push("raw-token");
    if ((after?.bindingEntryCount ?? 0) < requiredSupport(
      before.bindingEntryCount,
      minimumTrainingDistinctEntries,
    )) contexts.push("binding-context");
    if ((after?.motorEntryCount ?? 0) < requiredSupport(
      before.motorEntryCount,
      minimumTrainingDistinctEntries,
    )) contexts.push("motor-context");
    if (contexts.length > 0) violations.push({ tokenId, contexts });
  }
  return violations;
}

export function partitionBindingPreservingBaseline(
  input: PartitionInput,
  options: PartitionPolicyOptions = DEFAULT_BINDING_BASELINE_OPTIONS,
): PartitionDecision {
  validatePositiveInteger(options.evaluationEntryCount, "evaluationEntryCount");
  validatePositiveInteger(
    options.minimumTrainingDistinctEntries,
    "minimumTrainingDistinctEntries",
  );
  const entries = validatePartitionInput(input);
  if (entries.length <= options.evaluationEntryCount) {
    throw new RangeError("catalog must contain more entries than the evaluation target");
  }
  const originalSupport = createCatalogSupportIndex(entries);
  const candidates = [...entries].sort((left, right) =>
    left.frequencyBand - right.frequencyBand || compareText(left.id, right.id),
  );
  const evaluationEntryIds = new Set<string>();
  const trace: PartitionSelectionTrace[] = [];
  let step = 0;

  for (const entry of candidates) {
    if (evaluationEntryIds.size >= options.evaluationEntryCount) break;
    const proposed = new Set(evaluationEntryIds);
    proposed.add(entry.id);
    const proposedTraining = entries.filter((candidate) => !proposed.has(candidate.id));
    const violations = tokenContextViolations(
      originalSupport,
      createCatalogSupportIndex(proposedTraining),
      options.minimumTrainingDistinctEntries,
    );
    if (violations.length > 0) {
      trace.push({
        step,
        candidateEntryId: entry.id,
        action: "rejected",
        reasonCode: "baseline-token-context-support-violation",
        evaluationCountBefore: evaluationEntryIds.size,
        evaluationCountAfter: evaluationEntryIds.size,
        scoreComponents: {
          frequencyBand: entry.frequencyBand,
          violatedTokenCount: violations.length,
          violatedContextCount: violations.reduce(
            (total, violation) => total + violation.contexts.length,
            0,
          ),
        },
        violatedConstraintIds: ["baseline-token-context-support"],
        relatedRelationKeys: sortedUnique(
          violations.map((violation) => bindingRelationKey(violation.tokenId)),
        ),
        seedTieBreak: null,
      });
      step += 1;
      continue;
    }
    evaluationEntryIds.add(entry.id);
    trace.push({
      step,
      candidateEntryId: entry.id,
      action: "selected",
      reasonCode: "baseline-frequency-order-legal",
      evaluationCountBefore: evaluationEntryIds.size - 1,
      evaluationCountAfter: evaluationEntryIds.size,
      scoreComponents: {
        frequencyBand: entry.frequencyBand,
        stableEntryId: entry.id,
      },
      violatedConstraintIds: [],
      relatedRelationKeys: [],
      seedTieBreak: null,
    });
    step += 1;
  }

  trace.push({
    step,
    candidateEntryId: null,
    action: "stopped",
    reasonCode: evaluationEntryIds.size === options.evaluationEntryCount
      ? "evaluation-target-reached"
      : "candidate-list-exhausted",
    evaluationCountBefore: evaluationEntryIds.size,
    evaluationCountAfter: evaluationEntryIds.size,
    scoreComponents: {
      evaluationTarget: options.evaluationEntryCount,
    },
    violatedConstraintIds: evaluationEntryIds.size === options.evaluationEntryCount
      ? []
      : ["evaluation-entry-count"],
    relatedRelationKeys: [],
    seedTieBreak: null,
  });

  const finalTraining = entries.filter((entry) => !evaluationEntryIds.has(entry.id));
  const finalViolations = tokenContextViolations(
    originalSupport,
    createCatalogSupportIndex(finalTraining),
    options.minimumTrainingDistinctEntries,
  );

  return createPartitionDecision(input, {
    policyId: "binding-preserving-baseline-v1",
    seed: null,
    evaluationEntryIds,
    evaluationEntryCount: options.evaluationEntryCount,
    minimumTrainingDistinctEntries: options.minimumTrainingDistinctEntries,
    relationSupportConstraintKind: "diagnostic",
    selectionTrace: trace,
    fallbackReasons: [],
    additionalConstraintResults: [
      numericConstraint(
        "baseline-token-context-support",
        "hard",
        finalViolations.length,
        "equal",
        0,
        finalViolations.length === 0
          ? "raw-binding-motor-support-preserved"
          : "raw-binding-motor-support-lost",
        [],
        finalViolations.map((violation) => bindingRelationKey(violation.tokenId)),
      ),
    ],
  });
}

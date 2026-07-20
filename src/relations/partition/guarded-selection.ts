import type { CatalogEntry } from "../../core/model.js";
import {
  createPartitionRelationModel,
  relationSupportViolations,
  type PartitionRelationModel,
} from "./model.js";
import type {
  PartitionInput,
  PartitionSelectionTrace,
} from "./types.js";
import { compareText, sortedUnique } from "./utils.js";

export interface CandidateScore {
  readonly rank: readonly number[];
  readonly scoreComponents: Readonly<Record<string, number | string>>;
  readonly seedTieBreak: number | null;
}

export type CandidateScorer = (
  entry: CatalogEntry,
  evaluationEntryIds: ReadonlySet<string>,
  model: PartitionRelationModel,
) => CandidateScore;

export interface GuardedSelectionResult {
  readonly evaluationEntryIds: ReadonlySet<string>;
  readonly trace: readonly PartitionSelectionTrace[];
}

function compareRank(left: readonly number[], right: readonly number[]): number {
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (right[index] ?? 0) - (left[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function compareScoredCandidates(
  left: readonly [CatalogEntry, CandidateScore],
  right: readonly [CatalogEntry, CandidateScore],
): number {
  return compareRank(left[1].rank, right[1].rank)
    || (left[1].seedTieBreak ?? 0) - (right[1].seedTieBreak ?? 0)
    || compareText(left[0].id, right[0].id);
}

export function selectWithRelationSupportGuard(
  input: PartitionInput,
  evaluationEntryCount: number,
  minimumTrainingDistinctEntries: number,
  scorer: CandidateScorer,
): GuardedSelectionResult {
  const entries = [...input.entries].sort((left, right) => compareText(left.id, right.id));
  const model = createPartitionRelationModel(input.index);
  const evaluationEntryIds = new Set<string>();
  const trace: PartitionSelectionTrace[] = [];
  let traceStep = 0;

  while (evaluationEntryIds.size < evaluationEntryCount) {
    const legal: Array<readonly [CatalogEntry, CandidateScore]> = [];
    const blockedRelationKeys = new Set<string>();
    for (const entry of entries) {
      if (evaluationEntryIds.has(entry.id)) continue;
      const proposed = new Set(evaluationEntryIds);
      proposed.add(entry.id);
      const affectedKeys = model.entryRelationKeys[entry.id] ?? [];
      const violations = relationSupportViolations(
        model,
        proposed,
        minimumTrainingDistinctEntries,
        affectedKeys,
      );
      if (violations.length > 0) {
        const keys = violations.map((violation) => violation.relationKey);
        for (const key of keys) blockedRelationKeys.add(key);
        trace.push({
          step: traceStep,
          candidateEntryId: entry.id,
          action: "rejected",
          reasonCode: "relation-training-support-violation",
          evaluationCountBefore: evaluationEntryIds.size,
          evaluationCountAfter: evaluationEntryIds.size,
          scoreComponents: {
            violatedRelationCount: violations.length,
          },
          violatedConstraintIds: ["relation-training-support"],
          relatedRelationKeys: sortedUnique(keys),
          seedTieBreak: null,
        });
        traceStep += 1;
        continue;
      }
      legal.push([entry, scorer(entry, evaluationEntryIds, model)] as const);
    }

    if (legal.length === 0) {
      trace.push({
        step: traceStep,
        candidateEntryId: null,
        action: "stopped",
        reasonCode: "no-legal-candidate",
        evaluationCountBefore: evaluationEntryIds.size,
        evaluationCountAfter: evaluationEntryIds.size,
        scoreComponents: {
          remainingTarget: evaluationEntryCount - evaluationEntryIds.size,
        },
        violatedConstraintIds: ["evaluation-entry-count"],
        relatedRelationKeys: sortedUnique(blockedRelationKeys),
        seedTieBreak: null,
      });
      break;
    }

    legal.sort(compareScoredCandidates);
    const selected = legal[0]!;
    for (const [entry, score] of legal.slice(1)) {
      trace.push({
        step: traceStep,
        candidateEntryId: entry.id,
        action: "rejected",
        reasonCode: "lower-policy-score",
        evaluationCountBefore: evaluationEntryIds.size,
        evaluationCountAfter: evaluationEntryIds.size,
        scoreComponents: score.scoreComponents,
        violatedConstraintIds: [],
        relatedRelationKeys: [],
        seedTieBreak: score.seedTieBreak,
      });
      traceStep += 1;
    }
    evaluationEntryIds.add(selected[0].id);
    trace.push({
      step: traceStep,
      candidateEntryId: selected[0].id,
      action: "selected",
      reasonCode: "highest-legal-policy-score",
      evaluationCountBefore: evaluationEntryIds.size - 1,
      evaluationCountAfter: evaluationEntryIds.size,
      scoreComponents: selected[1].scoreComponents,
      violatedConstraintIds: [],
      relatedRelationKeys: [],
      seedTieBreak: selected[1].seedTieBreak,
    });
    traceStep += 1;
  }

  return { evaluationEntryIds, trace };
}

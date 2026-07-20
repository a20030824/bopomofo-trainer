import type { FrequencyBand } from "../../core/model.js";
import { createPartitionDecision, numericConstraint } from "./decision.js";
import {
  createPartitionRelationModel,
  relationSupportViolations,
  validatePartitionInput,
} from "./model.js";
import type {
  FrequencyStratifiedOptions,
  PartitionDecision,
  PartitionFallbackReason,
  PartitionInput,
  PartitionSelectionTrace,
} from "./types.js";
import {
  compareText,
  sortedUnique,
  validatePositiveInteger,
} from "./utils.js";

export const DEFAULT_FREQUENCY_STRATIFIED_OPTIONS: FrequencyStratifiedOptions = {
  evaluationEntryCount: 5,
  minimumTrainingDistinctEntries: 1,
  allowCrossBandFallback: true,
};

const BANDS: readonly FrequencyBand[] = [1, 2, 3];

function largestRemainderQuotas(
  counts: Readonly<Record<FrequencyBand, number>>,
  totalEntries: number,
  evaluationEntryCount: number,
): Readonly<Record<FrequencyBand, number>> {
  const raw = BANDS.map((band) => ({
    band,
    exact: counts[band] / totalEntries * evaluationEntryCount,
  }));
  const quotas: Record<FrequencyBand, number> = {
    1: Math.floor(raw[0]!.exact),
    2: Math.floor(raw[1]!.exact),
    3: Math.floor(raw[2]!.exact),
  };
  let remaining = evaluationEntryCount - BANDS.reduce(
    (total, band) => total + quotas[band],
    0,
  );
  const remainderOrder = [...raw].sort((left, right) =>
    (right.exact - Math.floor(right.exact))
      - (left.exact - Math.floor(left.exact))
    || left.band - right.band,
  );
  for (const item of remainderOrder) {
    if (remaining <= 0) break;
    quotas[item.band] += 1;
    remaining -= 1;
  }
  return quotas;
}

export function partitionFrequencyStratified(
  input: PartitionInput,
  options: FrequencyStratifiedOptions = DEFAULT_FREQUENCY_STRATIFIED_OPTIONS,
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
  const bandCounts: Record<FrequencyBand, number> = { 1: 0, 2: 0, 3: 0 };
  for (const entry of entries) bandCounts[entry.frequencyBand] += 1;
  const quotas = largestRemainderQuotas(
    bandCounts,
    entries.length,
    options.evaluationEntryCount,
  );
  const model = createPartitionRelationModel(input.report.index);
  const evaluationEntryIds = new Set<string>();
  const trace: PartitionSelectionTrace[] = [];
  const fallbackReasons: PartitionFallbackReason[] = [];
  let step = 0;

  const selectedInBand = (band: FrequencyBand): number => entries.filter(
    (entry) => entry.frequencyBand === band && evaluationEntryIds.has(entry.id),
  ).length;

  for (const band of BANDS) {
    while (selectedInBand(band) < quotas[band]) {
      const candidates = entries
        .filter((entry) =>
          entry.frequencyBand === band && !evaluationEntryIds.has(entry.id),
        )
        .sort((left, right) => compareText(left.id, right.id));
      let selected = false;
      const blockedKeys = new Set<string>();
      for (const entry of candidates) {
        const proposed = new Set(evaluationEntryIds);
        proposed.add(entry.id);
        const violations = relationSupportViolations(
          model,
          proposed,
          options.minimumTrainingDistinctEntries,
          model.entryRelationKeys[entry.id] ?? [],
        );
        if (violations.length > 0) {
          const keys = violations.map((violation) => violation.relationKey);
          for (const key of keys) blockedKeys.add(key);
          trace.push({
            step,
            candidateEntryId: entry.id,
            action: "rejected",
            reasonCode: "frequency-quota-relation-support-violation",
            evaluationCountBefore: evaluationEntryIds.size,
            evaluationCountAfter: evaluationEntryIds.size,
            scoreComponents: {
              frequencyBand: band,
              bandQuota: quotas[band],
              selectedInBand: selectedInBand(band),
              violatedRelationCount: violations.length,
            },
            violatedConstraintIds: ["relation-training-support"],
            relatedRelationKeys: sortedUnique(keys),
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
          reasonCode: "frequency-band-quota-selection",
          evaluationCountBefore: evaluationEntryIds.size - 1,
          evaluationCountAfter: evaluationEntryIds.size,
          scoreComponents: {
            frequencyBand: band,
            bandQuota: quotas[band],
            selectedInBand: selectedInBand(band),
            stableEntryId: entry.id,
          },
          violatedConstraintIds: [],
          relatedRelationKeys: [],
          seedTieBreak: null,
        });
        step += 1;
        selected = true;
        break;
      }
      if (selected) continue;
      const constraintId = `frequency-band-${band}-quota`;
      fallbackReasons.push({
        code: "frequency-band-quota-unmet",
        constraintId,
        message:
          `frequency band ${band} supplied ${selectedInBand(band)}/${quotas[band]} legal evaluation entries`,
        relatedEntryIds: [],
        relatedRelationKeys: sortedUnique(blockedKeys),
      });
      trace.push({
        step,
        candidateEntryId: null,
        action: "fallback",
        reasonCode: "frequency-band-quota-unmet",
        evaluationCountBefore: evaluationEntryIds.size,
        evaluationCountAfter: evaluationEntryIds.size,
        scoreComponents: {
          frequencyBand: band,
          bandQuota: quotas[band],
          selectedInBand: selectedInBand(band),
        },
        violatedConstraintIds: [constraintId],
        relatedRelationKeys: sortedUnique(blockedKeys),
        seedTieBreak: null,
      });
      step += 1;
      break;
    }
  }

  if (options.allowCrossBandFallback) {
    while (evaluationEntryIds.size < options.evaluationEntryCount) {
      const candidates = entries
        .filter((entry) => !evaluationEntryIds.has(entry.id))
        .sort((left, right) =>
          left.frequencyBand - right.frequencyBand || compareText(left.id, right.id),
        );
      let selected = false;
      const blockedKeys = new Set<string>();
      for (const entry of candidates) {
        const proposed = new Set(evaluationEntryIds);
        proposed.add(entry.id);
        const violations = relationSupportViolations(
          model,
          proposed,
          options.minimumTrainingDistinctEntries,
          model.entryRelationKeys[entry.id] ?? [],
        );
        if (violations.length > 0) {
          const keys = violations.map((violation) => violation.relationKey);
          for (const key of keys) blockedKeys.add(key);
          trace.push({
            step,
            candidateEntryId: entry.id,
            action: "rejected",
            reasonCode: "cross-band-fallback-relation-support-violation",
            evaluationCountBefore: evaluationEntryIds.size,
            evaluationCountAfter: evaluationEntryIds.size,
            scoreComponents: {
              frequencyBand: entry.frequencyBand,
              violatedRelationCount: violations.length,
            },
            violatedConstraintIds: ["relation-training-support"],
            relatedRelationKeys: sortedUnique(keys),
            seedTieBreak: null,
          });
          step += 1;
          continue;
        }
        evaluationEntryIds.add(entry.id);
        trace.push({
          step,
          candidateEntryId: entry.id,
          action: "fallback",
          reasonCode: "cross-band-quota-fallback-selected",
          evaluationCountBefore: evaluationEntryIds.size - 1,
          evaluationCountAfter: evaluationEntryIds.size,
          scoreComponents: {
            frequencyBand: entry.frequencyBand,
            selectedInBand: selectedInBand(entry.frequencyBand),
            bandQuota: quotas[entry.frequencyBand],
            stableEntryId: entry.id,
          },
          violatedConstraintIds: [],
          relatedRelationKeys: [],
          seedTieBreak: null,
        });
        step += 1;
        selected = true;
        break;
      }
      if (selected) continue;
      trace.push({
        step,
        candidateEntryId: null,
        action: "stopped",
        reasonCode: "no-legal-cross-band-fallback-candidate",
        evaluationCountBefore: evaluationEntryIds.size,
        evaluationCountAfter: evaluationEntryIds.size,
        scoreComponents: {
          remainingTarget: options.evaluationEntryCount - evaluationEntryIds.size,
        },
        violatedConstraintIds: ["evaluation-entry-count"],
        relatedRelationKeys: sortedUnique(blockedKeys),
        seedTieBreak: null,
      });
      step += 1;
      break;
    }
  }

  if (trace.at(-1)?.action !== "stopped") {
    trace.push({
      step,
      candidateEntryId: null,
      action: "stopped",
      reasonCode: evaluationEntryIds.size === options.evaluationEntryCount
        ? "evaluation-target-reached"
        : "frequency-quota-selection-complete",
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
  }

  return createPartitionDecision(input, {
    policyId: "frequency-stratified-v1",
    seed: null,
    evaluationEntryIds,
    evaluationEntryCount: options.evaluationEntryCount,
    minimumTrainingDistinctEntries: options.minimumTrainingDistinctEntries,
    relationSupportConstraintKind: "hard",
    selectionTrace: trace,
    fallbackReasons,
    additionalConstraintResults: BANDS.map((band) => numericConstraint(
      `frequency-band-${band}-quota`,
      "soft",
      selectedInBand(band),
      "equal",
      quotas[band],
      selectedInBand(band) === quotas[band]
        ? "frequency-band-quota-satisfied"
        : "frequency-band-quota-diverged",
      entries
        .filter((entry) => entry.frequencyBand === band && evaluationEntryIds.has(entry.id))
        .map((entry) => entry.id),
    )),
  });
}

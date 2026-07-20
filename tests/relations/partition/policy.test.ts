import { describe, expect, it } from "vitest";
import { transitionRelationKey } from "../../../src/relations/catalog-occurrences.js";
import {
  comparePartitionStability,
  evaluatePartitionMetrics,
  partitionBindingPreservingBaseline,
  partitionFrequencyStratified,
  partitionPathNovelty,
  partitionRelationSupportPreserving,
  partitionSeededMaximumCoverage,
  type PartitionDecision,
} from "../../../src/relations/partition/index.js";
import { toneToken, zhuyinToken } from "../../../src/scheme/tokens.js";
import {
  compileRealCatalog,
  createPartitionInput,
  readPartitionFixture,
} from "./helpers.js";

const THREE_ENTRY_OPTIONS = {
  evaluationEntryCount: 3,
  minimumTrainingDistinctEntries: 1,
} as const;

describe("relational partition policies", () => {
  it("reports the current 49-entry baseline's three evaluation-only transitions", async () => {
    const entries = await compileRealCatalog();
    const input = createPartitionInput(entries);
    const decision = partitionBindingPreservingBaseline(input);
    const expected = new Set([
      transitionRelationKey(zhuyinToken("ㄎ"), zhuyinToken("ㄜ")),
      transitionRelationKey(zhuyinToken("ㄜ"), toneToken(3)),
      transitionRelationKey(zhuyinToken("ㄩ"), zhuyinToken("ㄥ")),
    ]);

    expect(entries).toHaveLength(49);
    expect(decision.evaluationEntryIds).toHaveLength(5);
    expect(decision.metrics.bindingCoverage.evaluationOnlyRelationCount).toBe(0);
    expect(decision.metrics.transitionCoverage.evaluationOnlyRelationCount).toBe(3);
    expect(new Set(
      decision.metrics.transitionCoverage.evaluationOnlyRelationKeys,
    )).toEqual(expected);
    const supportDiagnostic = decision.constraintResults.find(
      (constraint) => constraint.id === "relation-training-support",
    );
    expect(supportDiagnostic).toMatchObject({
      kind: "diagnostic",
      status: "unsatisfied",
      actual: 13,
    });
    for (const relationKey of expected) {
      expect(supportDiagnostic?.relatedRelationKeys).toContain(relationKey);
    }
    expect(decision.selectionTrace.at(-1)).toMatchObject({
      action: "stopped",
      reasonCode: "evaluation-target-reached",
    });
  });

  it("preserves relation support on the feasible paired fixture", async () => {
    const input = createPartitionInput(await readPartitionFixture("feasible"));
    const decisions: readonly PartitionDecision[] = [
      partitionRelationSupportPreserving(input, THREE_ENTRY_OPTIONS),
      partitionFrequencyStratified(input, {
        ...THREE_ENTRY_OPTIONS,
        allowCrossBandFallback: true,
      }),
      partitionSeededMaximumCoverage(input, 17, THREE_ENTRY_OPTIONS),
      partitionPathNovelty(input, THREE_ENTRY_OPTIONS),
    ];

    for (const decision of decisions) {
      expect(decision.trainingEntryIds).toHaveLength(3);
      expect(decision.evaluationEntryIds).toHaveLength(3);
      expect(new Set([
        ...decision.trainingEntryIds,
        ...decision.evaluationEntryIds,
      ]).size).toBe(6);
      expect(decision.metrics.evaluationOnlyRelationCount).toBe(0);
      expect(decision.constraintResults.filter(
        (constraint) => constraint.kind === "hard" && constraint.status === "unsatisfied",
      )).toEqual([]);
      expect(evaluatePartitionMetrics(
        input,
        new Set(decision.evaluationEntryIds),
        decision.constraintResults,
      )).toEqual(decision.metrics);
    }
  });

  it("returns explicit hard-constraint failure for an infeasible held-out request", async () => {
    const input = createPartitionInput(await readPartitionFixture("infeasible"));
    const decision = partitionRelationSupportPreserving(input, {
      evaluationEntryCount: 1,
      minimumTrainingDistinctEntries: 1,
    });

    expect(decision.evaluationEntryIds).toEqual([]);
    expect(decision.constraintResults).toContainEqual(expect.objectContaining({
      id: "evaluation-entry-count",
      kind: "hard",
      status: "unsatisfied",
      actual: 0,
      expected: 1,
    }));
    expect(decision.fallbackReasons).toContainEqual(expect.objectContaining({
      code: "evaluation-target-unmet",
      constraintId: "evaluation-entry-count",
    }));
    expect(decision.selectionTrace).toContainEqual(expect.objectContaining({
      action: "stopped",
      reasonCode: "no-legal-candidate",
      violatedConstraintIds: ["evaluation-entry-count"],
    }));
  });

  it("replays seeded decisions independent of input entry order", async () => {
    const entries = await readPartitionFixture("feasible");
    const forward = createPartitionInput(entries);
    const reversed = createPartitionInput([...entries].reverse());
    const first = partitionSeededMaximumCoverage(forward, 20260720, THREE_ENTRY_OPTIONS);
    const replay = partitionSeededMaximumCoverage(forward, 20260720, THREE_ENTRY_OPTIONS);
    const reordered = partitionSeededMaximumCoverage(reversed, 20260720, THREE_ENTRY_OPTIONS);

    expect(JSON.stringify(replay)).toBe(JSON.stringify(first));
    expect(JSON.stringify(reordered)).toBe(JSON.stringify(first));
    expect(first.seed).toBe(20260720);
    expect(first.selectionTrace.some(
      (trace) => trace.seedTieBreak !== null,
    )).toBe(true);
  });

  it("produces replayable multi-seed stability reports", async () => {
    const input = createPartitionInput(await readPartitionFixture("feasible"));
    const build = () => [3, 5, 7, 11].map(
      (seed) => partitionSeededMaximumCoverage(input, seed, THREE_ENTRY_OPTIONS),
    );
    const first = comparePartitionStability(build());
    const replay = comparePartitionStability(build());

    expect(replay).toEqual(first);
    expect(first.seeds).toEqual([3, 5, 7, 11]);
    expect(first.decisionCount).toBe(4);
    expect(first.selectionRates.every(
      (rate) => rate.selectionRate >= 0 && rate.selectionRate <= 1,
    )).toBe(true);
    expect(first.determinismDigest).toMatch(/^[0-9a-f]{8}$/u);
  });
});

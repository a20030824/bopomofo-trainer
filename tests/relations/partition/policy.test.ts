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
  type PartitionInput,
} from "../../../src/relations/partition/index.js";
import { toneToken, zhuyinToken } from "../../../src/scheme/tokens.js";
import {
  compileRealCatalog,
  createPartitionInput,
  createStalePartitionInput,
  readPartitionFixture,
} from "./helpers.js";

const THREE_ENTRY_OPTIONS = {
  evaluationEntryCount: 3,
  minimumTrainingDistinctEntries: 1,
} as const;

function captureError(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    if (error instanceof Error) return error.message;
    throw error;
  }
  throw new Error("expected operation to throw");
}

describe("relational partition policies", () => {
  it("reports the current catalog baseline's support diagnostics", async () => {
    const entries = await compileRealCatalog();
    const input = createPartitionInput(entries);
    const decision = partitionBindingPreservingBaseline(input);

    expect(decision.trainingEntryIds).toHaveLength(entries.length - 5);
    expect(decision.evaluationEntryIds).toHaveLength(5);
    expect(new Set([
      ...decision.trainingEntryIds,
      ...decision.evaluationEntryIds,
    ]).size).toBe(entries.length);
    expect(decision.metrics.bindingCoverage.evaluationOnlyRelationCount).toBe(0);
    expect(decision.metrics.transitionCoverage.evaluationOnlyRelationKeys)
      .toHaveLength(decision.metrics.transitionCoverage.evaluationOnlyRelationCount);
    const supportDiagnostic = decision.constraintResults.find(
      (constraint) => constraint.id === "relation-training-support",
    );
    expect(supportDiagnostic).toMatchObject({ kind: "diagnostic" });
    expect(typeof supportDiagnostic?.actual).toBe("number");
    expect(decision.selectionTrace.at(-1)).toMatchObject({
      action: "stopped",
      reasonCode: "evaluation-target-reached",
    });
  });

  // Five relational partition strategies over the full active catalog
  // (1,786 entries); the default test timeout no longer covers this since
  // the top-10000 lexicon generation grew the catalog past its former
  // 322-entry size.
  it("runs all five strategies on the current catalog", async () => {
    const entries = await compileRealCatalog();
    const input = createPartitionInput(entries);
    const options = {
      evaluationEntryCount: 5,
      minimumTrainingDistinctEntries: 1,
    } as const;
    const decisions: readonly PartitionDecision[] = [
      partitionBindingPreservingBaseline(input),
      partitionRelationSupportPreserving(input, options),
      partitionFrequencyStratified(input, {
        ...options,
        allowCrossBandFallback: true,
      }),
      partitionSeededMaximumCoverage(input, 20260720, options),
      partitionPathNovelty(input, options),
    ];

    expect(new Set(decisions.map((decision) => decision.policyId)).size).toBe(5);
    for (const decision of decisions) {
      expect(decision.trainingEntryIds).toHaveLength(entries.length - 5);
      expect(decision.evaluationEntryIds).toHaveLength(5);
      expect(decision.constraintResults.filter(
        (constraint) => constraint.kind === "hard" && constraint.status === "unsatisfied",
      )).toEqual([]);
      expect(evaluatePartitionMetrics(
        input,
        new Set(decision.evaluationEntryIds),
        decision.constraintResults,
      )).toEqual(decision.metrics);
    }
    for (const decision of decisions.slice(1)) {
      expect(decision.metrics.evaluationOnlyRelationCount).toBe(0);
    }
  }, 30_000);

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

  it("counts repeated occurrences as one distinct supporting entry", async () => {
    const input = createPartitionInput(await readPartitionFixture("infeasible"));
    const repeatedKey = transitionRelationKey(
      zhuyinToken("ㄅ"),
      zhuyinToken("ㄚ"),
    );
    const crossSyllableKey = transitionRelationKey(
      toneToken(1),
      zhuyinToken("ㄅ"),
    );
    const decision = partitionRelationSupportPreserving(input, {
      evaluationEntryCount: 1,
      minimumTrainingDistinctEntries: 1,
    });

    expect(input.report.index.transitionOccurrences[repeatedKey]).toHaveLength(2);
    expect(input.report.index.support[repeatedKey]?.distinctEntryCount).toBe(1);
    expect(input.report.index.transitionOccurrences[crossSyllableKey]).toBeUndefined();
    expect(decision.evaluationEntryIds).toEqual([]);
    expect(decision.metrics.evaluationNovelty).toBe(0);
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

  it("rejects duplicate lexical identities before partitioning", async () => {
    const entries = await readPartitionFixture("feasible");
    const first = entries[0]!;
    const duplicate = {
      ...first,
      id: "fixture:duplicate-lexical-identity",
    };
    const input = createPartitionInput([...entries, duplicate]);

    expect(() => partitionRelationSupportPreserving(input, THREE_ENTRY_OPTIONS))
      .toThrow(/duplicate catalog lexical identity/u);
  });

  it("deterministically rejects a stale occurrence index before decision or metrics", async () => {
    const input = await createStalePartitionInput();
    const runPolicy = () => partitionRelationSupportPreserving(input, THREE_ENTRY_OPTIONS);
    const first = captureError(runPolicy);
    const replay = captureError(runPolicy);
    const metricError = captureError(() => evaluatePartitionMetrics(input, new Set(), []));

    expect(first).toMatch(
      /^partition relation index snapshot mismatch: canonical [0-9a-f]{8}, received [0-9a-f]{8}$/u,
    );
    expect(replay).toBe(first);
    expect(metricError).toBe(first);
  });

  it("rejects mode, layout, and support from different catalog snapshots", async () => {
    const input = createPartitionInput(await readPartitionFixture("feasible"));
    const observedSupport = Object.entries(input.report.index.support)
      .find(([, summary]) => summary.occurrenceCount > 0);
    if (observedSupport === undefined) throw new Error("fixture has no observed support");
    const [supportKey, supportSummary] = observedSupport;
    const mismatchedInputs: readonly PartitionInput[] = [
      {
        entries: input.entries,
        report: { ...input.report, mode: "recall" },
      },
      {
        entries: input.entries,
        report: { ...input.report, layoutId: "fixture:stale-layout" },
      },
      {
        entries: input.entries,
        report: {
          ...input.report,
          index: {
            ...input.report.index,
            support: {
              ...input.report.index.support,
              [supportKey]: {
                ...supportSummary,
                occurrenceCount: supportSummary.occurrenceCount + 1,
              },
            },
          },
        },
      },
    ];

    for (const mismatched of mismatchedInputs) {
      const first = captureError(() =>
        partitionRelationSupportPreserving(mismatched, THREE_ENTRY_OPTIONS));
      const replay = captureError(() =>
        partitionRelationSupportPreserving(mismatched, THREE_ENTRY_OPTIONS));
      expect(first).toMatch(
        /^partition relation index snapshot mismatch: canonical [0-9a-f]{8}, received [0-9a-f]{8}$/u,
      );
      expect(replay).toBe(first);
    }
  });

  it("replays every strategy independent of input entry order", async () => {
    const entries = await readPartitionFixture("feasible");
    const forward = createPartitionInput(entries);
    const reversed = createPartitionInput([...entries].reverse());
    const builders = [
      (input: typeof forward) => partitionBindingPreservingBaseline(
        input,
        THREE_ENTRY_OPTIONS,
      ),
      (input: typeof forward) => partitionRelationSupportPreserving(
        input,
        THREE_ENTRY_OPTIONS,
      ),
      (input: typeof forward) => partitionFrequencyStratified(input, {
        ...THREE_ENTRY_OPTIONS,
        allowCrossBandFallback: true,
      }),
      (input: typeof forward) => partitionPathNovelty(input, THREE_ENTRY_OPTIONS),
      (input: typeof forward) => partitionSeededMaximumCoverage(
        input,
        20260720,
        THREE_ENTRY_OPTIONS,
      ),
    ];

    for (const build of builders) {
      const first = build(forward);
      const replay = build(forward);
      const reordered = build(reversed);
      expect(JSON.stringify(replay)).toBe(JSON.stringify(first));
      expect(JSON.stringify(reordered)).toBe(JSON.stringify(first));
    }

    const seeded = builders.at(-1)!(forward);
    expect(seeded.seed).toBe(20260720);
    expect(seeded.selectionTrace.some(
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

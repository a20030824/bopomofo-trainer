import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { runRelationalExperiments } from "../../../src/simulation/experiment/report.js";
import {
  serializeRelationalExperimentCsv,
  serializeRelationalExperimentJson,
  serializeRelationalExperimentMarkdown,
} from "../../../src/simulation/experiment/serialize.js";
import type { RelationalExperimentPlan } from "../../../src/simulation/experiment/types.js";

async function smallPlan(): Promise<RelationalExperimentPlan> {
  const source = await readFile(
    new URL(
      "../../../data/fixtures/experiment/relational-cohort-v1.json",
      import.meta.url,
    ),
    "utf8",
  );
  const full = JSON.parse(source) as RelationalExperimentPlan;
  return {
    ...full,
    id: "small-harness-test",
    matrixOptions: {
      objectiveStrategyIds: ["binding-only-baseline", "transition-aware"],
      partitionPolicyIds: [
        "binding-preserving-baseline-v1",
        "relation-support-preserving-v1",
      ],
      compositionStrategyIds: [
        "fixed-six-baseline",
        "greedy-marginal-gain",
      ],
      learnerModelIds: [
        "synthetic-relational-v1",
        "missing-test-model-v1",
      ],
    },
    scenarioIds: ["weak-transition"],
    seeds: [17],
    rounds: 1,
  };
}

describe("relational experiment harness", () => {
  it("preserves every cell and records local learner failures", async () => {
    const report = runRelationalExperiments(await smallPlan());
    expect(report.runCount).toBe(16);
    expect(report.runs.filter(
      (run) => run.cell.learnerModelId === "missing-test-model-v1",
    )).toHaveLength(8);
    expect(report.runs.filter(
      (run) => run.cell.learnerModelId === "missing-test-model-v1",
    ).every((run) => run.failureCount > 0)).toBe(true);
    expect(report.runs.filter(
      (run) => run.cell.learnerModelId === "synthetic-relational-v1",
    ).some((run) => run.failureCount === 0)).toBe(true);
  });

  it("never selects an evaluation entry for learner exposure", async () => {
    const report = runRelationalExperiments(await smallPlan());
    for (const run of report.runs) {
      if (run.partitionDecision === null) continue;
      const evaluation = new Set(run.partitionDecision.evaluationEntryIds);
      for (const round of run.rounds) {
        expect((round.sequence?.items ?? []).every(
          (item) => !evaluation.has(item.entry.id),
        )).toBe(true);
      }
    }
  });

  it("replays JSON CSV and Markdown byte-for-byte", async () => {
    const plan = await smallPlan();
    const first = runRelationalExperiments(plan);
    const replay = runRelationalExperiments(plan);
    expect(serializeRelationalExperimentJson(replay)).toBe(
      serializeRelationalExperimentJson(first),
    );
    expect(serializeRelationalExperimentCsv(replay)).toBe(
      serializeRelationalExperimentCsv(first),
    );
    expect(serializeRelationalExperimentMarkdown(replay)).toBe(
      serializeRelationalExperimentMarkdown(first),
    );
    expect(replay.determinismDigest).toBe(first.determinismDigest);
  });
});

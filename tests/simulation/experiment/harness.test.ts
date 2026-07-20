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
  it("preserves every cell and contains unknown learner failures locally", async () => {
    const report = runRelationalExperiments(await smallPlan());
    const missing = report.runs.filter(
      (run) => run.cell.learnerModelId === "missing-test-model-v1",
    );
    const registered = report.runs.filter(
      (run) => run.cell.learnerModelId === "synthetic-relational-v1",
    );
    const missingExecutableRounds = missing.flatMap((run) =>
      run.rounds.filter((round) =>
        round.sequence !== null
        && round.sequence.items.length > 0
        && round.sequence.mode !== null
        && round.sequence.layoutId !== null
      )
    );

    expect(report.runCount).toBe(16);
    expect(missing).toHaveLength(8);
    expect(missingExecutableRounds.length).toBeGreaterThan(0);
    expect(missingExecutableRounds.every((round) =>
      round.learnerBatch === null
      && round.failures.some((failure) => failure.stage === "learner")
    )).toBe(true);
    expect(registered.every((run) => run.rounds.every((round) =>
      round.failures.every((failure) => failure.stage !== "learner")
    ))).toBe(true);
    expect(registered.some((run) =>
      run.rounds.some((round) => round.learnerBatch !== null)
    )).toBe(true);
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

import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { runRelationalExperiments } from "../../../src/simulation/experiment/report.js";
import type { RelationalExperimentPlan } from "../../../src/simulation/experiment/types.js";

it("executes a partition report with a declared confusion pool", async () => {
  const plan = JSON.parse(await readFile(
    new URL("../../../data/fixtures/experiment/relational-cohort-v1.json", import.meta.url),
    "utf8",
  )) as RelationalExperimentPlan;
  const report = runRelationalExperiments({
    ...plan,
    id: "partition-confusion-contract",
    matrixOptions: {
      objectiveStrategyIds: ["binding-only-baseline"],
      partitionPolicyIds: ["binding-preserving-baseline-v1"],
      compositionStrategyIds: ["fixed-six-baseline"],
      learnerModelIds: ["synthetic-relational-v1"],
    },
    scenarioIds: ["weak-binding"],
    seeds: [101],
    rounds: 1,
  });
  const run = report.runs[0]!;

  expect(run.partitionDecision).not.toBeNull();
  expect(Object.keys(run.relationReport.index.confusionContrastPools).length).toBeGreaterThan(0);
  expect(run.rounds[0]?.failures.every((failure) => failure.stage !== "partition"))
    .toBe(true);
});

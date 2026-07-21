import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { runRelationalConfirmation } from "../../../src/simulation/confirmation/report.js";
import { serializeRelationalConfirmationJson } from "../../../src/simulation/confirmation/serialize.js";
import type { RelationalConfirmationPlan } from "../../../src/simulation/confirmation/types.js";

async function reducedPlan(): Promise<RelationalConfirmationPlan> {
  const source = JSON.parse(await readFile(
    new URL(
      "../../../data/fixtures/experiment/relational-confirmatory-v1.json",
      import.meta.url,
    ),
    "utf8",
  )) as RelationalConfirmationPlan;
  return {
    ...source,
    id: "relational-confirmation-test",
    cells: source.cells.filter((item) =>
      item.role === "historical-baseline" || item.role === "phase-7g-candidate"
    ),
    scenarioIds: [
      "weak-binding",
      "asymmetric-confusion",
      "heterogeneous-improvement",
    ],
    seeds: [101, 202],
    rounds: 3,
  };
}

describe("relational confirmation report", () => {
  it("replays compact trajectories without leaking evaluation entries", async () => {
    const plan = await reducedPlan();
    const first = runRelationalConfirmation(plan);
    const replay = runRelationalConfirmation(plan);
    const json = serializeRelationalConfirmationJson(first);

    expect(first.runCount).toBe(18);
    expect(first.roundCount).toBe(54);
    expect(first.survival).toHaveLength(9);
    expect(serializeRelationalConfirmationJson(replay)).toBe(json);
    expect(replay.determinismDigest).toBe(first.determinismDigest);
    expect(json).not.toContain("learnerBatch");
    expect(json).not.toContain("generationDecisions");
    expect(json).not.toContain("interaction-trace");

    for (const run of first.runs) {
      const evaluation = new Set(run.evaluationEntryIds);
      expect(run.trajectories).toHaveLength(3);
      for (const trajectory of run.trajectories) {
        expect(trajectory.selectedEntryIds.some((entryId) => evaluation.has(entryId)))
          .toBe(false);
      }
      if (run.role !== "historical-baseline") {
        expect(first.runs.some((reference) =>
          reference.cell.id === run.matchedReferenceCellId
          && reference.scenarioId === run.scenarioId
          && reference.seed === run.seed
        )).toBe(true);
      }
    }
  }, 15_000);
});

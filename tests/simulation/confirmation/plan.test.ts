import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { stableStringify } from "../../../src/composition/stable.js";
import { createDefaultConfirmationCells } from "../../../src/simulation/confirmation/candidates.js";
import {
  canonicalizeRelationalConfirmationPlan,
  relationalConfirmationPlanDigest,
} from "../../../src/simulation/confirmation/plan.js";
import type { RelationalConfirmationPlan } from "../../../src/simulation/confirmation/types.js";

async function fixture(): Promise<RelationalConfirmationPlan> {
  const source = await readFile(
    new URL(
      "../../../data/fixtures/experiment/relational-confirmatory-v1.json",
      import.meta.url,
    ),
    "utf8",
  );
  return JSON.parse(source) as RelationalConfirmationPlan;
}

describe("relational confirmation plan", () => {
  it("declares the targeted extended cohort and pinned findings provenance", async () => {
    const source = await fixture();
    const canonical = canonicalizeRelationalConfirmationPlan(source);
    const defaults = canonicalizeRelationalConfirmationPlan({
      ...source,
      cells: createDefaultConfirmationCells(),
    });

    expect(canonical.cells).toHaveLength(11);
    expect(canonical.scenarioIds).toHaveLength(7);
    expect(canonical.seeds).toHaveLength(10);
    expect(canonical.rounds).toBe(8);
    expect(canonical.sourceReportDigest).toBe("cddf2d38");
    expect(canonical.sourceAnalysisDigest).toBe("da68b959");
    expect(stableStringify(canonical.cells)).toBe(stableStringify(defaults.cells));
    expect(canonical.cells.filter((item) => item.role === "historical-baseline"))
      .toHaveLength(1);
    expect(canonical.cells.filter((item) => item.role === "phase-7g-candidate"))
      .toHaveLength(2);
    expect(canonical.cells.filter((item) => item.role === "composer-ablation"))
      .toHaveLength(6);
    expect(canonical.cells.filter((item) => item.role === "transition-diagnostic"))
      .toHaveLength(2);
    expect(canonical.cells.filter((item) => item.role !== "historical-baseline")
      .every((item) => item.anchorScenarioIds.length > 0)).toBe(true);
  });

  it("is invariant to caller ordering", async () => {
    const source = await fixture();
    const reordered: RelationalConfirmationPlan = {
      ...source,
      catalog: [...source.catalog].reverse(),
      cells: [...source.cells].reverse().map((cell) => ({
        ...cell,
        anchorScenarioIds: [...cell.anchorScenarioIds].reverse(),
      })),
      scenarioIds: [...source.scenarioIds].reverse(),
      seeds: [...source.seeds].reverse(),
      confusionRelations: [...source.confusionRelations].reverse(),
    };

    expect(relationalConfirmationPlanDigest(reordered))
      .toBe(relationalConfirmationPlanDigest(source));
  });

  it("rejects composer ablations that change more than composition", async () => {
    const source = await fixture();
    const index = source.cells.findIndex((item) => item.role === "composer-ablation");
    const cells = [...source.cells];
    cells[index] = {
      ...cells[index]!,
      partitionPolicyId: "frequency-stratified-v1",
    };

    expect(() => canonicalizeRelationalConfirmationPlan({ ...source, cells }))
      .toThrow("must change only composition");
  });

  it("rejects a missing matrix-declared baseline", async () => {
    const source = await fixture();
    expect(() => canonicalizeRelationalConfirmationPlan({
      ...source,
      cells: source.cells.filter((item) => item.role !== "historical-baseline"),
    })).toThrow("exactly the matrix-declared historical baseline");
  });

  it("rejects undeclared anchor scenarios", async () => {
    const source = await fixture();
    const cells = source.cells.map((item) => item.role === "phase-7g-candidate"
      ? { ...item, anchorScenarioIds: ["not-in-plan"] }
      : item);
    expect(() => canonicalizeRelationalConfirmationPlan({ ...source, cells }))
      .toThrow("anchor scenario is not in the plan");
  });
});

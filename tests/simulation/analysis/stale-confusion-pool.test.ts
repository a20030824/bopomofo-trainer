import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { createRelationalCatalogReport } from "../../../src/relations/catalog-report.js";
import { validatePartitionInput } from "../../../src/relations/partition/model.js";
import type { RelationalExperimentPlan } from "../../../src/simulation/experiment/types.js";

it("rejects a stale confusion contrast pool", async () => {
  const plan = JSON.parse(await readFile(
    new URL("../../../data/fixtures/experiment/relational-cohort-v1.json", import.meta.url),
    "utf8",
  )) as RelationalExperimentPlan;
  const report = createRelationalCatalogReport(plan.catalog, {
    mode: "guided",
    layoutId: "zhuyin-standard",
    partitionByEntryId: Object.fromEntries(
      plan.catalog.map((entry) => [entry.id, "training"] as const),
    ),
    confusionRelations: plan.confusionRelations,
  });
  const [key, pool] = Object.entries(report.index.confusionContrastPools)[0]!;
  const stale = {
    ...report,
    index: {
      ...report.index,
      confusionContrastPools: {
        ...report.index.confusionContrastPools,
        [key]: { ...pool, expectedEntryIds: pool.expectedEntryIds.slice(1) },
      },
    },
  };

  expect(() => validatePartitionInput({ entries: plan.catalog, report: stale }))
    .toThrow("partition relation index snapshot mismatch");
});

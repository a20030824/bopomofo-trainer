import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { runRelationalExperiments } from "../../../src/simulation/experiment/report.js";
import type {
  RelationalExperimentPlan,
  RelationalExperimentReport,
} from "../../../src/simulation/experiment/types.js";
import { createRelationalStrategyMatrix } from "../../../src/simulation/strategy-matrix.js";
import { RELATIONAL_ANALYSIS_POLICY } from "../../../src/simulation/analysis/policy.js";
import { analyzeRelationalExperiments } from "../../../src/simulation/analysis/report.js";
import { serializeRelationalAnalysisJson } from "../../../src/simulation/analysis/serialize.js";

async function smallReport(): Promise<RelationalExperimentReport> {
  const source = await readFile(
    new URL(
      "../../../data/fixtures/experiment/relational-cohort-v1.json",
      import.meta.url,
    ),
    "utf8",
  );
  const plan = JSON.parse(source) as RelationalExperimentPlan;
  return runRelationalExperiments({
    ...plan,
    id: "analysis-test",
    matrixOptions: {
      objectiveStrategyIds: ["binding-only-baseline", "transition-aware"],
      partitionPolicyIds: ["binding-preserving-baseline-v1"],
      compositionStrategyIds: ["fixed-six-baseline"],
      learnerModelIds: ["synthetic-relational-v1"],
    },
    scenarioIds: ["weak-transition"],
    seeds: [101, 202],
    rounds: 2,
  });
}

describe("relational experiment analysis", () => {
  it("uses the matrix-declared baseline and preserves balanced axis groups", async () => {
    const source = await smallReport();
    const analysis = analyzeRelationalExperiments(source);
    const baseline = createRelationalStrategyMatrix().baselineCellId;

    expect(analysis.baselineCellId).toBe(baseline);
    expect(analysis.comparisons).toHaveLength(2);
    expect(analysis.comparisons.every((item) => item.baselineCellId === baseline)).toBe(true);
    expect(analysis.comparisons.find((item) => item.cellId === baseline)?.recommendation)
      .toBe("inconclusive");
    expect(analysis.axisSummaries.every((item) => item.balanced)).toBe(true);
    expect(Object.values(analysis.recommendationCounts)
      .reduce((sum, value) => sum + value, 0)).toBe(analysis.comparisons.length);
  });

  it("is input-order invariant", async () => {
    const source = await smallReport();
    const reordered: RelationalExperimentReport = {
      ...source,
      runs: [...source.runs].reverse(),
      aggregates: [...source.aggregates].reverse(),
    };
    const first = analyzeRelationalExperiments(source);
    const replay = analyzeRelationalExperiments(reordered);

    expect(serializeRelationalAnalysisJson(replay)).toBe(
      serializeRelationalAnalysisJson(first),
    );
    expect(replay.determinismDigest).toBe(first.determinismDigest);
  });

  it("rejects a source report that omits the fixed baseline", async () => {
    const source = await smallReport();
    const baseline = createRelationalStrategyMatrix().baselineCellId;
    const withoutBaseline: RelationalExperimentReport = {
      ...source,
      runs: source.runs.filter((run) => run.cell.id !== baseline),
      aggregates: source.aggregates.filter((item) => item.cellId !== baseline),
    };
    expect(() => analyzeRelationalExperiments(withoutBaseline))
      .toThrow("source report does not contain the matrix-declared baseline cell");
  });

  it("validates versioned guardrails", async () => {
    const source = await smallReport();
    expect(() => analyzeRelationalExperiments(source, {
      ...RELATIONAL_ANALYSIS_POLICY,
      maximumFallbackRate: -1,
    })).toThrow("maximumFallbackRate must be between zero and one");
  });
});

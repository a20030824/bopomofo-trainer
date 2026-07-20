import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  runRelationalResearchIntegration,
  serializeRelationalResearchIntegrationReport,
  type RelationalResearchIntegrationFixture,
} from "../../src/integration/relational-research.js";

async function readFixture(): Promise<{
  readonly fixture: RelationalResearchIntegrationFixture;
  readonly referenceInput: string;
}> {
  const [fixtureSource, referenceInput] = await Promise.all([
    readFile(
      new URL(
        "../../data/fixtures/integration/relational-research.json",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL("../../data/fixtures/integration/reference.csv", import.meta.url),
      "utf8",
    ),
  ]);
  return {
    fixture: JSON.parse(fixtureSource) as RelationalResearchIntegrationFixture,
    referenceInput,
  };
}

describe("relational research integration", () => {
  it("connects review, partition, composition, trace generation, and Phase 3 measurement", async () => {
    const { fixture, referenceInput } = await readFixture();
    const report = runRelationalResearchIntegration(fixture, referenceInput);

    expect(report.reference.importResult.summary).toMatchObject({
      sourceRowCount: 2,
      acceptedCount: 1,
      rejectedCount: 1,
      unresolvedPronunciationCount: 1,
    });
    expect(report.reference.importResult.errors[0]?.code).toBe("unresolved_alternatives");
    expect(report.reference.reviewQueue.ranked).toHaveLength(1);
    expect(report.reference.reviewQueue.ranked[0]?.candidate.text).toBe("中");
    expect(report.reference.approvalBoundary).toBe("manual-review-required");
    expect(report.reference.reviewedCatalogMutation).toBe("none");

    expect(report.partition.decision.evaluationEntryIds).toHaveLength(1);
    expect(report.partition.decision.constraintResults.filter(
      (constraint) => constraint.kind === "hard" && constraint.status === "unsatisfied",
    )).toEqual([]);

    const evaluationIds = new Set(report.partition.decision.evaluationEntryIds);
    expect(report.composition.items).toHaveLength(1);
    expect(report.composition.items.every(
      (item) => !evaluationIds.has(item.entry.id),
    )).toBe(true);
    expect(report.composition.retrievalTrace.exclusions.some(
      (exclusion) => exclusion.reason === "evaluation-partition",
    )).toBe(true);
    expect(report.composition.stopReason).toBe("target-satisfied");
    expect(report.composition.targetExposureCount).toBe(1);

    expect(report.learner.stopReason).toBe("sequence-complete");
    expect(report.learner.traces.length).toBeGreaterThan(0);
    expect(report.learner.measurementEstimate.decisions.length).toBe(
      report.learner.traces.length,
    );
    expect(report.learner.estimationErrorReport.components.length).toBeGreaterThan(0);
  });

  it("replays byte-for-byte with identical fixtures, policies, and seeds", async () => {
    const { fixture, referenceInput } = await readFixture();
    const first = runRelationalResearchIntegration(fixture, referenceInput);
    const replay = runRelationalResearchIntegration(fixture, referenceInput);

    expect(serializeRelationalResearchIntegrationReport(first)).toBe(
      serializeRelationalResearchIntegrationReport(replay),
    );
    expect(first.determinismDigest).toEqual(replay.determinismDigest);
    expect(first.reference.importResult.summary.determinismDigest).toBe(
      replay.reference.importResult.summary.determinismDigest,
    );
    expect(first.partition.decision.metrics.determinismDigest).toBe(
      replay.partition.decision.metrics.determinismDigest,
    );
    expect(first.composition.id).toBe(replay.composition.id);
    expect(first.learner.determinismDigest).toEqual(replay.learner.determinismDigest);
  });
});

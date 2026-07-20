import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { composePracticeSequence } from "../../src/composition/composer.js";
import { stableStringify } from "../../src/composition/stable.js";
import { createSeededRandom } from "../../src/curriculum/random.js";
import {
  runRelationalResearchIntegration,
  serializeRelationalResearchIntegrationReport,
  type RelationalResearchIntegrationFixture,
} from "../../src/integration/relational-research.js";
import { createRelationalCatalogReport } from "../../src/relations/catalog-report.js";
import { partitionRelationSupportPreserving } from "../../src/relations/partition/strategies.js";

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

function compositionPreflight(fixture: RelationalResearchIntegrationFixture) {
  const objective = fixture.composition.objective;
  if (objective.kind !== "transition") {
    throw new Error("integration preflight expects the committed transition objective");
  }
  const allTraining = Object.fromEntries(
    fixture.reviewedCatalog.map((entry) => [entry.id, "training"] as const),
  );
  const initialReport = createRelationalCatalogReport(fixture.reviewedCatalog, {
    mode: objective.relation.scope.mode,
    layoutId: objective.relation.scope.layoutId,
    partitionByEntryId: allTraining,
  });
  const decision = partitionRelationSupportPreserving(
    { entries: fixture.reviewedCatalog, report: initialReport },
    fixture.partition,
  );
  const evaluationIds = new Set(decision.evaluationEntryIds);
  const partitionedReport = createRelationalCatalogReport(fixture.reviewedCatalog, {
    mode: objective.relation.scope.mode,
    layoutId: objective.relation.scope.layoutId,
    partitionByEntryId: Object.fromEntries(fixture.reviewedCatalog.map((entry) => [
      entry.id,
      evaluationIds.has(entry.id) ? "evaluation" : "training",
    ] as const)),
  });
  const sequence = composePracticeSequence({
    objective,
    relationIndex: partitionedReport.index,
    entries: fixture.reviewedCatalog,
    history: fixture.composition.history,
    budget: fixture.composition.budget,
    policy: fixture.composition.policy,
    random: createSeededRandom(fixture.composition.seed),
  });
  return { decision, partitionedReport, sequence };
}

describe("relational research integration", () => {
  it("connects review, partition, composition, trace generation, and Phase 3 measurement", async () => {
    const { fixture, referenceInput } = await readFixture();
    const preflight = compositionPreflight(fixture);
    expect(
      preflight.sequence.items,
      stableStringify({
        evaluationEntryIds: preflight.decision.evaluationEntryIds,
        transitionKeys: Object.keys(preflight.partitionedReport.index.transitionOccurrences),
        retrievalTrace: preflight.sequence.retrievalTrace,
        stopReason: preflight.sequence.stopReason,
      }),
    ).not.toHaveLength(0);

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

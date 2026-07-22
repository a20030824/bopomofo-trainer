import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { compileCatalog } from "../../src/catalog/compile-catalog.js";
import { parseCsv } from "../../src/catalog/csv.js";
import { createProvenanceRegistry } from "../../src/catalog/provenance.js";
import { partitionCatalogForProduct } from "../../src/product/catalog-partition.js";
import { transitionRelationKey } from "../../src/relations/catalog-occurrences.js";
import { createRelationalCatalogReport } from "../../src/relations/catalog-report.js";
import { STANDARD_BOPOMOFO_LAYOUT } from "../../src/scheme/standard-layout.js";
import { zhuyinToken } from "../../src/scheme/tokens.js";

async function compileRealCatalog() {
  const [source, provenanceSource] = await Promise.all([
    readFile(new URL("../../data/source/words.sample.csv", import.meta.url), "utf8"),
    readFile(new URL("../../data/provenance.csv", import.meta.url), "utf8"),
  ]);
  const provenance = createProvenanceRegistry(parseCsv(provenanceSource).records);
  expect(provenance.errors).toEqual([]);
  const compiled = compileCatalog(parseCsv(source).records, provenance.ids);
  expect(compiled.errors).toEqual([]);
  return compiled.entries;
}

interface RelationStateCountShape {
  readonly unsupported: number;
  readonly evaluationOnly: number;
  readonly rareOnly: number;
  readonly concentrated: number;
  readonly supported: number;
}

function sumCounts(counts: RelationStateCountShape): number {
  return counts.unsupported
    + counts.evaluationOnly
    + counts.rareOnly
    + counts.concentrated
    + counts.supported;
}

describe("real relational catalog report", () => {
  it("reconciles and classifies the complete 80-entry snapshot", async () => {
    const entries = await compileRealCatalog();
    const partition = partitionCatalogForProduct(entries, 5, 3);
    const evaluationIds = new Set(partition.evaluation.map((entry) => entry.id));
    const partitionByEntryId = Object.fromEntries(
      entries.map((entry) => [
        entry.id,
        evaluationIds.has(entry.id) ? "evaluation" : "training",
      ] as const),
    );
    const report = createRelationalCatalogReport(entries, {
      mode: "guided",
      layoutId: STANDARD_BOPOMOFO_LAYOUT.id,
      partitionByEntryId,
    });

    const expectedSyllables = entries.reduce(
      (total, entry) => total + entry.syllables.length,
      0,
    );
    const expectedTokens = entries.reduce(
      (total, entry) => total + entry.syllables.reduce(
        (entryTotal, syllable) => entryTotal + syllable.tokens.length,
        0,
      ),
      0,
    );
    const expectedTransitions = entries.reduce(
      (total, entry) => total + entry.syllables.reduce(
        (entryTotal, syllable) => entryTotal + Math.max(0, syllable.tokens.length - 1),
        0,
      ),
      0,
    );

    expect(entries).toHaveLength(80);
    expect(report.totals).toMatchObject({
      entries: 80,
      trainingEntries: 75,
      evaluationEntries: 5,
      syllables: expectedSyllables,
      tokenOccurrences: expectedTokens,
      transitionOccurrences: expectedTransitions,
    });
    expect(report.totals.observedBindingRelations).toBe(report.totals.bindingRelations);
    expect(report.totals.observedTransitionRelations).toBeGreaterThan(0);
    expect(report.totals.observedTransitionRelations).toBeLessThanOrEqual(
      report.totals.transitionRelations,
    );
    expect(sumCounts(report.stateCounts.binding)).toBe(report.totals.bindingRelations);
    expect(sumCounts(report.stateCounts.transition)).toBe(report.totals.transitionRelations);
    expect(report.stateCounts.binding.unsupported).toBe(0);
    expect(report.stateCounts.binding.evaluationOnly).toBe(0);
    expect(report.determinismDigest).toMatch(/^[0-9a-f]{8}$/u);

    const entryInitialCount = Object.values(report.index.bindingOccurrences)
      .flat()
      .filter((occurrence) => occurrence.entryInitial).length;
    expect(entryInitialCount).toBe(80);

    expect(new Set(report.partitionSupportLossKeys).size)
      .toBe(report.partitionSupportLossKeys.length);
    for (const key of report.partitionSupportLossKeys) {
      expect(report.index.support[key]).toMatchObject({
        trainingOccurrenceCount: 0,
        supportState: "evaluation-only",
      });
    }
  });

  it("finds exact ㄓ to ㄨ paths in reviewed text positions", async () => {
    const entries = await compileRealCatalog();
    const partition = partitionCatalogForProduct(entries, 5, 3);
    const evaluationIds = new Set(partition.evaluation.map((entry) => entry.id));
    const report = createRelationalCatalogReport(entries, {
      mode: "guided",
      layoutId: STANDARD_BOPOMOFO_LAYOUT.id,
      partitionByEntryId: Object.fromEntries(entries.map((entry) => [
        entry.id,
        evaluationIds.has(entry.id) ? "evaluation" : "training",
      ] as const)),
    });
    const key = transitionRelationKey(zhuyinToken("ㄓ"), zhuyinToken("ㄨ"));
    const occurrences = report.index.transitionOccurrences[key] ?? [];
    const textById = new Map(entries.map((entry) => [entry.id, entry.prompt.text]));
    const texts = [...new Set(occurrences.map((occurrence) => textById.get(occurrence.entryId)))]
      .filter((text): text is string => text !== undefined)
      .sort();

    expect(texts).toEqual(["中國", "中文", "建築", "民眾", "注音", "重要"]);
    expect(occurrences.every((occurrence) => occurrence.fromTokenIndex === 0)).toBe(true);
  });
});

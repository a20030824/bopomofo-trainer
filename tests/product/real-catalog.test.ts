import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { compileCatalog } from "../../src/catalog/compile-catalog.js";
import { parseCsv } from "../../src/catalog/csv.js";
import { createProvenanceRegistry } from "../../src/catalog/provenance.js";
import { createCatalogSupportIndex } from "../../src/curriculum/support.js";
import { compileGrammarAnnotations } from "../../src/grammar/compile-annotations.js";
import { STANDARD_BOPOMOFO_LAYOUT } from "../../src/scheme/standard-layout.js";
import { partitionCatalogForProduct } from "../../src/product/catalog-partition.js";
import {
  createFreshProgressForEnvironment,
  createProductEnvironment,
  createProductState,
} from "../../src/product/session.js";

describe("frequency-first product real catalog integration", () => {
  it("reserves held-out entries and emits one grammar-valid stage-1 utterance", async () => {
    const [source, grammarSource, provenanceSource] = await Promise.all([
      readFile(new URL("../../data/source/words.sample.csv", import.meta.url), "utf8"),
      readFile(new URL("../../data/source/grammar.sample.csv", import.meta.url), "utf8"),
      readFile(new URL("../../data/provenance.csv", import.meta.url), "utf8"),
    ]);
    const provenance = createProvenanceRegistry(parseCsv(provenanceSource).records);
    expect(provenance.errors).toEqual([]);
    const compiled = compileCatalog(parseCsv(source).records, provenance.ids);
    expect(compiled.errors).toEqual([]);
    const grammar = compileGrammarAnnotations(
      parseCsv(grammarSource).records,
      compiled.entries,
      provenance.ids,
    );
    expect(grammar.errors).toEqual([]);

    const partition = partitionCatalogForProduct(compiled.entries, 5, 3);
    expect(partition.practice).toHaveLength(compiled.entries.length - 5);
    expect(partition.evaluation).toHaveLength(5);

    const originalSupport = createCatalogSupportIndex(compiled.entries);
    const practiceSupport = createCatalogSupportIndex(partition.practice);
    for (const original of Object.values(originalSupport.byToken)) {
      const current = practiceSupport.byToken[original.tokenId]!;
      expect(current.entryCount).toBeGreaterThanOrEqual(Math.min(original.entryCount, 3));
      expect(current.bindingEntryCount).toBeGreaterThanOrEqual(
        Math.min(original.bindingEntryCount, 3),
      );
      expect(current.motorEntryCount).toBeGreaterThanOrEqual(
        Math.min(original.motorEntryCount, 3),
      );
    }

    const environment = createProductEnvironment({
      ...partition,
      grammarAnnotations: grammar.annotations,
    });
    const progress = createFreshProgressForEnvironment(
      environment,
      "integration",
      "guided",
      STANDARD_BOPOMOFO_LAYOUT.id,
    );
    const state = createProductState(environment, progress, 0);
    expect(state.round.kind).toBe("practice");
    expect(state.round.selection.stage).toBe(1);
    expect(state.round.exercise.entries).toEqual(state.round.selection.utterance.entries);
    expect(state.round.exercise.entries.length).toBeGreaterThan(0);
    expect(state.round.exercise.entries.every((entry) => entry.frequencyBand === 1)).toBe(true);
    expect(state.round.selection.utterance.kind).toMatch(/template|standalone/);
  });
});

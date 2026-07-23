import { describe, expect, it } from "vitest";
import type { CatalogEntry } from "../../src/core/model.js";
import { buildSyntaxCoverageReport } from "../../src/syntax/coverage.js";
import { DEFAULT_DERIVATION_BOUNDS } from "../../src/syntax/features.js";
import { FORMAL_SYNTAX_FIXTURES, FORMAL_SYNTAX_RULES } from "../../src/syntax/grammar.js";
import { UPOS_VALUES, type SyntaxProfile, type Upos } from "../../src/syntax/types.js";

function entry(id: string, text: string): CatalogEntry {
  return {
    id,
    prompt: { text, locale: "zh-TW" },
    syllables: [{ tokens: ["zhuyin:ㄅ", "tone:1"] }],
    frequencyBand: 1,
    tags: ["test"],
    provenanceIds: ["test"],
  };
}

function profile(upos: Upos, entryId: string): SyntaxProfile {
  return {
    id: `profile:${upos}:${entryId}`,
    entryId,
    upos,
    functions: ["unspecified", "punctuation", "marker", "coordinator", "determiner", "numeral", "adposition"],
    valencyFrames: ["avalent", "intransitive", "transitive"],
    provenanceIds: ["test"],
    dependencyEvidence: {
      evidenceScope: "per-upos",
      occurrenceCount: 1,
      dependencyRelationCounts: { root: 1 },
      morphologicalFeatureCounts: {},
      parentUposCounts: { ROOT: 1 },
      headDirectionCounts: { root: 1 },
      surfacePositionCounts: { singleton: 1 },
      childRelationCounts: {},
      childDirectionRelationCounts: {},
      childRelationMultisetCounts: { none: 1 },
      valencyRelationCounts: {},
      valencySignatureCounts: { none: 1 },
      constructionRelationCounts: {},
      anonymousDependencySkeletons: [],
      rootCount: 1,
    },
  };
}

describe("formal syntax coverage report", () => {
  it("reports all UPOS positions, fixtures, reading variants, and profile reachability", () => {
    const entries = UPOS_VALUES.map((upos) => entry(`entry:${upos}`, upos));
    const heteronymA = entry("entry:東西:1", "東西");
    const heteronymB = entry("entry:東西:2", "東西");
    const profiles = [
      ...UPOS_VALUES.map((upos, index) => profile(upos, entries[index]!.id)),
      profile("NOUN", heteronymA.id),
      profile("NOUN", heteronymB.id),
    ];
    const first = buildSyntaxCoverageReport({
      entries: [...entries, heteronymA, heteronymB],
      profiles,
      rules: FORMAL_SYNTAX_RULES,
      fixtures: FORMAL_SYNTAX_FIXTURES,
      derivationShapeCountByBound: [{ bounds: DEFAULT_DERIVATION_BOUNDS, count: 10, complete: true }],
    });
    const second = buildSyntaxCoverageReport({
      entries: [...entries, heteronymA, heteronymB],
      profiles,
      rules: FORMAL_SYNTAX_RULES,
      fixtures: FORMAL_SYNTAX_FIXTURES,
      derivationShapeCountByBound: [{ bounds: DEFAULT_DERIVATION_BOUNDS, count: 10, complete: true }],
    });
    expect(first.uposCoverage.missingLexicalPositions).toEqual([]);
    expect(first.productionRuleCoverage.missingPositiveFixtureRuleIds).toEqual([]);
    expect(first.productionRuleCoverage.missingNegativeFixtureRuleIds).toEqual([]);
    expect(first.readingVariantCoverage).toMatchObject({
      writtenFormWithMultipleReadingsCount: 1,
      readingVariantEntryCount: 2,
      fullyProfiledWrittenFormCount: 1,
    });
    expect(first.unrealizableProfileCount).toBe(0);
    expect(first.determinismDigest).toBe(second.determinismDigest);
  });

  it("lists entries with no UD evidence instead of assigning a profile", () => {
    const uncovered = entry("entry:none", "無");
    const report = buildSyntaxCoverageReport({
      entries: [uncovered],
      profiles: [],
      rules: FORMAL_SYNTAX_RULES,
      fixtures: FORMAL_SYNTAX_FIXTURES,
    });
    expect(report.catalogEntrySyntaxCoverage).toMatchObject({
      noUdEvidenceEntryCount: 1,
      noUdEvidenceEntryIds: [uncovered.id],
    });
  });
});

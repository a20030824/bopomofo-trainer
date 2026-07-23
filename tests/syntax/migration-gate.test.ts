import { describe, expect, it } from "vitest";
import type { SyntaxCoverageReport } from "../../src/syntax/coverage.js";
import { evaluateFixedTemplateRemovalGate } from "../../src/syntax/migration-gate.js";

const completeCoverage: SyntaxCoverageReport = {
  schemaVersion: "formal-syntax-coverage-v1",
  grammarVersion: "mandarin-formal-grammar-v1",
  uposCoverage: {
    supported: ["NOUN"],
    observedProfileCounts: { NOUN: 1 },
    lexicalPositionCounts: { NOUN: 1 },
    missingLexicalPositions: [],
  },
  dependencyRelationCoverage: { root: 1 },
  productionRuleCoverage: {
    ruleCount: 1,
    positiveFixtureCount: 1,
    negativeFixtureCount: 1,
    missingPositiveFixtureRuleIds: [],
    missingNegativeFixtureRuleIds: [],
  },
  constructionCoverage: { sentence: 1 },
  catalogEntrySyntaxCoverage: {
    catalogEntryCount: 1,
    entryWithProfileCount: 1,
    noUdEvidenceEntryCount: 0,
    noUdEvidenceEntryIds: [],
  },
  readingVariantCoverage: {
    writtenFormWithMultipleReadingsCount: 0,
    readingVariantEntryCount: 0,
    fullyProfiledWrittenFormCount: 0,
    partiallyProfiledWrittenForms: [],
  },
  unrealizableProfileCount: 0,
  unrealizableProfileIds: [],
  derivationShapeCountByBound: [{
    bounds: {
      maximumPhraseDepth: 4,
      maximumClauseNesting: 3,
      maximumClausesPerSentence: 4,
      maximumCoordinationItems: 3,
      maximumConsecutiveModifiers: 3,
      maximumComplementsPerPredicate: 2,
      maximumLexicalEntriesPerUtterance: 12,
    },
    count: 1,
    complete: true,
  }],
  determinismDigest: "test",
};

describe("fixed-template removal gate", () => {
  it("blocks removal while the committed evidence and product migration are incomplete", () => {
    const result = evaluateFixedTemplateRemovalGate({
      coverage: completeCoverage,
      syntaxEvidenceSchemaVersion: "ud-grammar-evidence-v1",
      legacyCandidateParityPassed: false,
      browserSessionMigrationPassed: false,
      progressMigrationPassed: false,
      heldOutIsolationPassed: false,
      formalRuntimeDefaultEnabled: false,
    });
    expect(result.removalAllowed).toBe(false);
    expect(result.blockingReasons).toContain("syntax-evidence-v2-not-active");
    expect(result.blockingReasons).toContain("legacy-candidate-parity-not-passed");
    expect(result.blockingReasons).toContain("formal-runtime-not-default");
  });

  it("allows removal only after every formal and product gate passes", () => {
    expect(evaluateFixedTemplateRemovalGate({
      coverage: completeCoverage,
      syntaxEvidenceSchemaVersion: "ud-syntax-evidence-v2",
      legacyCandidateParityPassed: true,
      browserSessionMigrationPassed: true,
      progressMigrationPassed: true,
      heldOutIsolationPassed: true,
      formalRuntimeDefaultEnabled: true,
    })).toEqual({ removalAllowed: true, blockingReasons: [] });
  });
});

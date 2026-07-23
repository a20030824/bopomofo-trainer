import { describe, expect, it } from "vitest";
import type { CatalogEntry } from "../../src/core/model.js";
import { FORMAL_GRAMMAR_VERSION } from "../../src/syntax/features.js";
import { sha256Canonical } from "../../src/reference/importers/canonical-json.js";
import {
  applyCatalogSyntaxLegalityArtifact,
  filterCatalogBySyntaxLegality,
  type CatalogSyntaxLegalityArtifact,
} from "../../src/syntax/catalog-legality.js";
import type { ProductionRule, SyntaxProfile } from "../../src/syntax/types.js";

function entry(id: string): CatalogEntry {
  return {
    id,
    prompt: { text: id, locale: "zh-TW" },
    syllables: [{ tokens: ["zhuyin:ㄅ", "tone:1"] }],
    frequencyBand: 1,
    tags: ["test"],
    provenanceIds: ["test"],
  };
}

function profile(entryId: string): SyntaxProfile {
  return {
    id: `profile:${entryId}`,
    entryId,
    upos: "NOUN",
    functions: ["subject"],
    valencyFrames: ["avalent"],
    provenanceIds: ["ud:test"],
    dependencyEvidence: {
      evidenceScope: "per-upos",
      occurrenceCount: 1,
      dependencyRelationCounts: { nsubj: 1 },
      morphologicalFeatureCounts: {},
      parentUposCounts: { VERB: 1 },
      headDirectionCounts: { "head-right": 1 },
      surfacePositionCounts: { initial: 1 },
      childRelationCounts: {},
      childDirectionRelationCounts: {},
      childRelationMultisetCounts: { none: 1 },
      valencyRelationCounts: {},
      valencySignatureCounts: { none: 1 },
      constructionRelationCounts: {},
      anonymousDependencySkeletons: [],
      rootCount: 0,
    },
  };
}

const rules: readonly ProductionRule[] = [{
  id: "sentence.subject",
  grammarVersion: FORMAL_GRAMMAR_VERSION,
  output: "Sentence",
  constituents: [{
    key: "subject",
    category: "Lexeme",
    minimum: 1,
    maximum: 1,
    recursive: false,
    allowedUpos: ["NOUN"],
    requiredFunctions: ["subject"],
    requiredValencyFrames: [],
    requiredFeatures: {},
  }],
  surfaceOrders: [{ id: "canonical", constituentKeys: ["subject"] }],
  constraints: [],
  positiveFixtureIds: ["sentence.subject:positive"],
  negativeFixtureIds: ["sentence.subject:negative"],
}];

describe("app catalog syntax legality gate", () => {
  it("packages only entries that reach a Sentence rule", () => {
    const legal = entry("legal");
    const unseen = entry("unseen");
    const result = filterCatalogBySyntaxLegality({
      entries: [legal, unseen],
      profiles: [profile(legal.id)],
      rules,
    });

    expect(result.entries.map((item) => item.id)).toEqual([legal.id]);
    expect(result.exclusions).toEqual([{
      entryId: unseen.id,
      text: unseen.prompt.text,
      status: "no-ud-evidence",
    }]);
  });

  it("rejects a stale packaging allowlist and applies a current one", () => {
    const legal = entry("legal");
    const excluded = entry("excluded");
    const entries = [legal, excluded];
    const core = {
      schemaVersion: "formal-syntax-catalog-legality-v1" as const,
      grammarVersion: FORMAL_GRAMMAR_VERSION,
      catalogEntryCount: 2,
      catalogDigest: sha256Canonical(entries),
      sourceSelectionDigest: "selection",
      sourceEvidenceDigest: "evidence",
      sourceProfileProjectionDigest: "profiles",
      sourceRuleIndexDigest: "rules",
      legalEntryCount: 1,
      exclusionCount: 1,
      legalEntryIds: [legal.id],
      exclusions: [{
        entryId: excluded.id,
        text: excluded.prompt.text,
        status: "no-ud-evidence" as const,
      }],
    };
    const artifact: CatalogSyntaxLegalityArtifact = {
      ...core,
      determinismDigest: sha256Canonical(core),
    };

    expect(applyCatalogSyntaxLegalityArtifact(entries, artifact).entries)
      .toEqual([legal]);
    expect(() => applyCatalogSyntaxLegalityArtifact([legal], artifact))
      .toThrow(/stale or invalid/u);
    const wrongGrammarCore = {
      ...core,
      grammarVersion: "obsolete-grammar",
    };
    const wrongGrammar: CatalogSyntaxLegalityArtifact = {
      ...wrongGrammarCore,
      determinismDigest: sha256Canonical(wrongGrammarCore),
    };
    expect(() => applyCatalogSyntaxLegalityArtifact(entries, wrongGrammar))
      .toThrow(/stale or invalid/u);
  });
});

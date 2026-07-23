import { describe, expect, it } from "vitest";
import { FORMAL_GRAMMAR_VERSION } from "../../src/syntax/features.js";
import { buildSyntaxRuleIndex } from "../../src/syntax/rule-index.js";
import type {
  ProductionConstituent,
  ProductionRule,
  SyntaxProfile,
  Upos,
} from "../../src/syntax/types.js";

function constituent(
  key: string,
  category: ProductionConstituent["category"],
  options: Partial<ProductionConstituent> = {},
): ProductionConstituent {
  return {
    key,
    category,
    minimum: 1,
    maximum: 1,
    recursive: false,
    allowedUpos: [],
    requiredFunctions: [],
    requiredValencyFrames: [],
    requiredFeatures: {},
    ...options,
  };
}

function rule(
  id: string,
  output: ProductionRule["output"],
  constituents: readonly ProductionConstituent[],
): ProductionRule {
  return {
    id,
    grammarVersion: FORMAL_GRAMMAR_VERSION,
    output,
    constituents,
    surfaceOrders: [{ id: "canonical", constituentKeys: constituents.map((item) => item.key) }],
    constraints: [],
    positiveFixtureIds: [`${id}:positive`],
    negativeFixtureIds: [`${id}:negative`],
  };
}

function profile(
  entryId: string,
  upos: Upos,
  relation: string,
  valencySignature = "none",
): SyntaxProfile {
  const functions = relation === "nsubj" ? ["subject"] as const : ["predicate"] as const;
  return {
    id: `profile:${entryId}:${upos}`,
    entryId,
    upos,
    functions,
    valencyFrames: upos === "VERB" ? ["intransitive"] : ["avalent"],
    provenanceIds: ["ud:test"],
    dependencyEvidence: {
      evidenceScope: "per-upos",
      occurrenceCount: 1,
      dependencyRelationCounts: { [relation]: 1 },
      morphologicalFeatureCounts: {},
      parentUposCounts: {},
      headDirectionCounts: relation === "root" ? { root: 1 } : { "head-right": 1 },
      surfacePositionCounts: { medial: 1 },
      childRelationCounts: {},
      childDirectionRelationCounts: {},
      childRelationMultisetCounts: { none: 1 },
      valencyRelationCounts: {},
      valencySignatureCounts: { [valencySignature]: 1 },
      constructionRelationCounts: {},
      anonymousDependencySkeletons: [],
      rootCount: relation === "root" ? 1 : 0,
    },
  };
}

const rules: readonly ProductionRule[] = [
  rule("phrase.noun", "NounPhrase", [
    constituent("head", "Lexeme", { allowedUpos: ["NOUN"] }),
  ]),
  rule("phrase.verb", "VerbPhrase", [
    constituent("head", "Lexeme", { allowedUpos: ["VERB"] }),
  ]),
  rule("clause.intransitive", "Clause", [
    constituent("subject", "NounPhrase", { requiredFunctions: ["subject"] }),
    constituent("predicate", "VerbPhrase", {
      requiredFunctions: ["predicate"],
      requiredValencyFrames: ["intransitive"],
    }),
  ]),
  rule("sentence.declarative", "Sentence", [
    constituent("clause", "Clause", { requiredFeatures: { clauseType: "declarative" } }),
  ]),
];

describe("manifest-scale syntax rule index", () => {
  it("finds sentence paths without enumerating sentence combinations", () => {
    const lexemes = [
      { id: "candidate:1", text: "甲", generalRank: 1 },
      { id: "candidate:2", text: "走", generalRank: 2 },
      { id: "candidate:3", text: "未見", generalRank: 3 },
    ];
    const index = buildSyntaxRuleIndex({
      lexemes,
      profiles: [
        profile("candidate:1", "NOUN", "nsubj"),
        profile("candidate:2", "VERB", "root"),
      ],
      rules,
    });

    expect(index.entries[0]).toMatchObject({
      status: "indexed",
      sentenceRuleIds: ["sentence.declarative"],
    });
    expect(index.entries[1]).toMatchObject({
      status: "indexed",
      sentenceRuleIds: ["sentence.declarative"],
    });
    expect(index.entries[2]).toMatchObject({ status: "no-ud-evidence" });
    expect(index.globallyRealizableRuleCount).toBe(4);
  });

  it("processes 10,000 identities deterministically and keeps unseen rows", () => {
    const lexemes = Array.from({ length: 10_000 }, (_, offset) => ({
      id: `candidate:${offset + 1}`,
      text: `詞${offset + 1}`,
      generalRank: offset + 1,
    }));
    const profiles = lexemes.slice(0, 5_000).map((item, index) =>
      index % 2 === 0
        ? profile(item.id, "NOUN", "nsubj")
        : profile(item.id, "VERB", "root")
    );
    const first = buildSyntaxRuleIndex({ lexemes, profiles, rules });
    const second = buildSyntaxRuleIndex({
      lexemes: [...lexemes].reverse(),
      profiles: [...profiles].reverse(),
      rules: [...rules].reverse(),
    });

    expect(first).toEqual(second);
    expect(first.candidateCount).toBe(10_000);
    expect(first.noUdEvidenceCandidateCount).toBe(5_000);
    expect(first.entries).toHaveLength(10_000);
  });

  it("fails closed on a lexical feature absent from UD evidence", () => {
    const featureRule = rule("sentence.request", "Sentence", [
      constituent("marker", "Lexeme", {
        allowedUpos: ["VERB"],
        requiredFeatures: { clauseType: "request" },
      }),
    ]);
    const index = buildSyntaxRuleIndex({
      lexemes: [{ id: "candidate:1", text: "走", generalRank: 1 }],
      profiles: [profile("candidate:1", "VERB", "root")],
      rules: [featureRule],
    });

    expect(index.rules[0]).toMatchObject({
      globallyRealizable: false,
      blockerConstituentKeys: ["marker"],
      unsupportedFeatureNames: ["clauseType"],
    });
  });
});

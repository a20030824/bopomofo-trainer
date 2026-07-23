import { describe, expect, it } from "vitest";
import { FORMAL_GRAMMAR_VERSION } from "../../src/syntax/features.js";
import { countStructuralDerivationShapes } from "../../src/syntax/count.js";
import type { ProductionRule } from "../../src/syntax/types.js";

const baseRules: readonly ProductionRule[] = [
  {
    id: "sentence.base",
    grammarVersion: FORMAL_GRAMMAR_VERSION,
    output: "Sentence",
    constituents: [{
      key: "noun",
      category: "NounPhrase",
      minimum: 1,
      maximum: 1,
      recursive: false,
      allowedUpos: [],
      requiredFunctions: [],
      requiredValencyFrames: [],
      requiredFeatures: {},
    }],
    surfaceOrders: [{ id: "canonical", constituentKeys: ["noun"] }],
    constraints: [],
    positiveFixtureIds: ["sentence.base:positive"],
    negativeFixtureIds: ["sentence.base:negative"],
  },
  {
    id: "noun.base",
    grammarVersion: FORMAL_GRAMMAR_VERSION,
    output: "NounPhrase",
    constituents: [{
      key: "head",
      category: "Lexeme",
      minimum: 1,
      maximum: 1,
      recursive: false,
      allowedUpos: ["NOUN"],
      requiredFunctions: [],
      requiredValencyFrames: [],
      requiredFeatures: {},
    }],
    surfaceOrders: [{ id: "canonical", constituentKeys: ["head"] }],
    constraints: [],
    positiveFixtureIds: ["noun.base:positive"],
    negativeFixtureIds: ["noun.base:negative"],
  },
];

describe("exact structural derivation shape counting", () => {
  it("counts the complete non-recursive closure without materializing shapes", () => {
    expect(countStructuralDerivationShapes({
      rootCategory: "Sentence",
      rules: baseRules,
    })).toBe("1");
  });

  it("counts every recursive depth variant exactly", () => {
    const recursive: ProductionRule = {
      ...baseRules[1]!,
      id: "noun.recursive",
      constituents: [{
        ...baseRules[0]!.constituents[0]!,
        category: "NounPhrase",
        recursive: true,
      }],
      surfaceOrders: [{ id: "canonical", constituentKeys: ["noun"] }],
      positiveFixtureIds: ["noun.recursive:positive"],
      negativeFixtureIds: ["noun.recursive:negative"],
    };
    expect(countStructuralDerivationShapes({
      rootCategory: "Sentence",
      rules: [...baseRules, recursive],
      bounds: {
        maximumPhraseDepth: 2,
        maximumClauseNesting: 1,
        maximumClausesPerSentence: 1,
        maximumCoordinationItems: 3,
        maximumConsecutiveModifiers: 3,
        maximumComplementsPerPredicate: 2,
        maximumLexicalEntriesPerUtterance: 12,
      },
    })).toBe("3");
  });
});

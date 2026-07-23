import { describe, expect, it } from "vitest";
import { FORMAL_GRAMMAR_VERSION } from "../../src/syntax/features.js";
import {
  collectStructuralDerivations,
  enumerateStructuralDerivations,
} from "../../src/syntax/derive.js";
import type { ProductionRule, SyntaxCategory } from "../../src/syntax/types.js";

function rule(
  id: string,
  output: SyntaxCategory,
  category: SyntaxCategory,
  recursive = false,
): ProductionRule {
  return {
    id,
    grammarVersion: FORMAL_GRAMMAR_VERSION,
    output,
    constituents: [{
      key: "child",
      category,
      minimum: 1,
      maximum: 1,
      recursive,
      allowedUpos: category === "Lexeme" ? ["NOUN"] : [],
      requiredFunctions: [],
      requiredValencyFrames: [],
      requiredFeatures: {},
    }],
    surfaceOrders: [{ id: "canonical", constituentKeys: ["child"] }],
    constraints: [],
    positiveFixtureIds: [`${id}:positive`],
    negativeFixtureIds: [`${id}:negative`],
  };
}

describe("bounded structural derivation", () => {
  it("enumerates deterministically without lexical Cartesian expansion", () => {
    const rules = [
      rule("sentence", "Sentence", "NounPhrase"),
      rule("noun.base", "NounPhrase", "Lexeme"),
    ];
    const first = [...enumerateStructuralDerivations({ rootCategory: "Sentence", rules })];
    const second = [...enumerateStructuralDerivations({ rootCategory: "Sentence", rules })];
    expect(first.map((item) => item.id)).toEqual(second.map((item) => item.id));
    expect(first).toHaveLength(1);
    expect(first[0]?.lexicalSlotCount).toBe(1);
  });

  it("terminates recursive phrase closure at the configured depth", () => {
    const rules = [
      rule("sentence", "Sentence", "NounPhrase"),
      rule("noun.base", "NounPhrase", "Lexeme"),
      rule("noun.recursive", "NounPhrase", "NounPhrase", true),
    ];
    const shapes = [...enumerateStructuralDerivations({
      rootCategory: "Sentence",
      rules,
      bounds: {
        maximumPhraseDepth: 2,
        maximumClauseNesting: 1,
        maximumClausesPerSentence: 1,
        maximumCoordinationItems: 3,
        maximumConsecutiveModifiers: 3,
        maximumComplementsPerPredicate: 2,
        maximumLexicalEntriesPerUtterance: 12,
      },
    })];
    expect(shapes).toHaveLength(3);
    expect(shapes.every((item) => item.lexicalSlotCount === 1)).toBe(true);
  });

  it("can inspect a bounded prefix without materializing the full closure", () => {
    const rules = [
      rule("sentence", "Sentence", "NounPhrase"),
      rule("noun.base", "NounPhrase", "Lexeme"),
      rule("noun.recursive", "NounPhrase", "NounPhrase", true),
    ];
    expect(collectStructuralDerivations({ rootCategory: "Sentence", rules }, 2))
      .toHaveLength(2);
  });
});

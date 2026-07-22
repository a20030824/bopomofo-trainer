import { describe, expect, it } from "vitest";
import {
  DEFAULT_DERIVATION_BOUNDS,
  FORBIDDEN_SYNTAX_FIELDS,
  FORMAL_GRAMMAR_VERSION,
} from "../../src/syntax/features.js";
import {
  UPOS_VALUES,
  type ProductionConstituent,
  type ProductionRule,
  type SyntaxCategory,
} from "../../src/syntax/types.js";
import {
  findForbiddenSyntaxFields,
  validateGrammar,
} from "../../src/syntax/validate.js";

function constituent(
  key: string,
  category: SyntaxCategory,
  recursive = false,
): ProductionConstituent {
  return {
    key,
    category,
    minimum: 1,
    maximum: 1,
    recursive,
    allowedUpos: [],
    requiredFunctions: [],
    requiredValencyFrames: [],
    requiredFeatures: {},
  };
}

function rule(
  id: string,
  output: SyntaxCategory,
  constituents: readonly ProductionConstituent[],
): ProductionRule {
  return {
    id,
    grammarVersion: FORMAL_GRAMMAR_VERSION,
    output,
    constituents,
    surfaceOrders: [{
      id: "canonical",
      constituentKeys: constituents.map((item) => item.key),
    }],
    constraints: [],
    positiveFixtureIds: [`${id}:positive`],
    negativeFixtureIds: [`${id}:negative`],
  };
}

describe("formal grammar validation", () => {
  it("locks the complete UD UPOS vocabulary", () => {
    expect(UPOS_VALUES).toEqual([
      "ADJ", "ADP", "ADV", "AUX", "CCONJ", "DET", "INTJ", "NOUN", "NUM",
      "PART", "PRON", "PROPN", "PUNCT", "SCONJ", "SYM", "VERB", "X",
    ]);
  });

  it("accepts a finite syntax-only production", () => {
    expect(validateGrammar([
      rule("phrase.noun-head", "NounPhrase", [constituent("head", "NominalHead")]),
    ]).errors).toEqual([]);
  });

  it("rejects every forbidden semantic field at any depth", () => {
    for (const field of FORBIDDEN_SYNTAX_FIELDS) {
      const errors = findForbiddenSyntaxFields({ outer: [{ [field]: "forbidden" }] });
      expect(errors.map((item) => item.code)).toContain("forbidden-field");
      expect(errors[0]?.path).toContain(field);
    }
  });

  it("rejects duplicate IDs, unbounded repetition, and incomplete orders", () => {
    const base = rule("duplicate", "NounPhrase", [constituent("head", "NominalHead")]);
    const invalid = {
      ...base,
      constituents: [{ ...base.constituents[0]!, maximum: Number.POSITIVE_INFINITY }],
      surfaceOrders: [{ id: "canonical", constituentKeys: [] }],
    };
    const codes = validateGrammar([invalid, base]).errors.map((item) => item.code);
    expect(codes).toContain("duplicate-rule-id");
    expect(codes).toContain("invalid-cardinality");
    expect(codes).toContain("invalid-surface-order");
  });

  it("requires every recursive cycle to consume depth budget", () => {
    const unmarked = [
      rule("relative.attach", "NounPhrase", [
        constituent("relative", "RelativeClause", false),
      ]),
      rule("relative.nominal", "RelativeClause", [
        constituent("nominal", "NounPhrase", false),
      ]),
    ];
    expect(validateGrammar(unmarked).errors.map((item) => item.code))
      .toContain("unmarked-recursion-cycle");

    const marked = [
      rule("relative.attach", "NounPhrase", [
        constituent("relative", "RelativeClause", true),
      ]),
      rule("relative.nominal", "RelativeClause", [
        constituent("nominal", "NounPhrase", false),
      ]),
    ];
    expect(validateGrammar(marked).errors).toEqual([]);
  });

  it("rejects non-finite derivation bounds", () => {
    const result = validateGrammar([
      rule("phrase.noun-head", "NounPhrase", [constituent("head", "NominalHead")]),
    ], {
      ...DEFAULT_DERIVATION_BOUNDS,
      maximumPhraseDepth: Number.POSITIVE_INFINITY,
    });
    expect(result.errors.map((item) => item.code)).toContain("invalid-bound");
  });
});

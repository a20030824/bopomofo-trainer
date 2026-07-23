import { describe, expect, it } from "vitest";
import { FORMAL_GRAMMAR_VERSION } from "../../src/syntax/features.js";
import type { ProductionRule } from "../../src/syntax/types.js";
import { validateGrammar } from "../../src/syntax/validate.js";

const constrainedRule: ProductionRule = {
  id: "sentence.constrained",
  grammarVersion: FORMAL_GRAMMAR_VERSION,
  output: "Sentence",
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
  constraints: [{
    kind: "requires-constituent",
    ifPresentKey: "head",
    targetKey: "head",
  }],
  positiveFixtureIds: ["sentence.constrained:positive"],
  negativeFixtureIds: ["sentence.constrained:negative"],
};

describe("formal production constraint boundary", () => {
  it("rejects non-empty constraints instead of silently ignoring them", () => {
    const errors = validateGrammar([constrainedRule]).errors;
    expect(errors).toContainEqual(expect.objectContaining({
      code: "invalid-constraint",
      path: "rules.sentence.constrained.constraints",
    }));
  });
});

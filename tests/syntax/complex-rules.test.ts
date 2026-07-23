import { describe, expect, it } from "vitest";
import {
  COMPLEX_PRODUCTION_RULES,
  FORMAL_SYNTAX_FIXTURES,
  FORMAL_SYNTAX_RULES,
} from "../../src/syntax/grammar.js";
import { validateGrammarBundle } from "../../src/syntax/validate.js";

const REQUIRED = [
  "complex.coordination",
  "complex.additive",
  "complex.alternative",
  "complex.cause-result",
  "complex.condition",
  "complex.hypothetical",
  "complex.concessive",
  "complex.contrast",
  "complex.purpose",
  "complex.temporal-sequence",
  "complex.bounded-clause-sequence",
  "sentence.complex",
  "phrase.noun.multi-relative",
] as const;

describe("formal recursive complex-clause inventory", () => {
  it("validates all recursive paths in the complete grammar", () => {
    expect(validateGrammarBundle(FORMAL_SYNTAX_RULES, FORMAL_SYNTAX_FIXTURES).errors)
      .toEqual([]);
  });

  it("contains each declared complex construction", () => {
    const ids = new Set(COMPLEX_PRODUCTION_RULES.map((rule) => rule.id));
    expect(REQUIRED.filter((id) => !ids.has(id))).toEqual([]);
  });

  it("bounds clause sequences at four and relative modifiers at three", () => {
    const sequence = COMPLEX_PRODUCTION_RULES.find(
      (rule) => rule.id === "complex.bounded-clause-sequence",
    );
    const relative = COMPLEX_PRODUCTION_RULES.find(
      (rule) => rule.id === "phrase.noun.multi-relative",
    );
    expect(sequence?.constituents[0]).toMatchObject({ minimum: 2, maximum: 4, recursive: true });
    expect(relative?.constituents[0]).toMatchObject({ minimum: 1, maximum: 3, recursive: true });
  });

  it("declares connective relations as formal features only", () => {
    const serialized = JSON.stringify(COMPLEX_PRODUCTION_RULES);
    expect(serialized).toContain('"coordinationType"');
    expect(serialized).not.toContain('"meaning"');
    expect(serialized).not.toContain('"worldKnowledge"');
  });
});

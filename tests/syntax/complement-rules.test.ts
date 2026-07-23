import { describe, expect, it } from "vitest";
import {
  COMPLEMENT_PRODUCTION_RULES,
  FORMAL_SYNTAX_FIXTURES,
  FORMAL_SYNTAX_RULES,
} from "../../src/syntax/rules.js";
import { validateGrammarBundle } from "../../src/syntax/validate.js";

const REQUIRED = [
  "complement.result",
  "complement.directional",
  "complement.potential",
  "complement.degree",
  "complement.quantity",
  "complement.duration",
  "clause.subject-content",
  "clause.object-content",
  "clause.complement-content",
  "relative.clause",
  "phrase.noun.relative",
  "phrase.noun.de-nominalization",
  "quoted.clause",
  "clause.quoted-content",
] as const;

describe("formal complement and embedded-clause inventory", () => {
  it("validates recursive complement rules in the complete bundle", () => {
    expect(validateGrammarBundle(FORMAL_SYNTAX_RULES, FORMAL_SYNTAX_FIXTURES).errors)
      .toEqual([]);
  });

  it("covers every required complement and embedded-clause construction", () => {
    const ids = new Set(COMPLEMENT_PRODUCTION_RULES.map((rule) => rule.id));
    expect(REQUIRED.filter((id) => !ids.has(id))).toEqual([]);
  });

  it("marks every embedded return to Clause or NounPhrase as recursive", () => {
    const embedded = COMPLEMENT_PRODUCTION_RULES.flatMap((rule) =>
      rule.constituents.filter((item) =>
        item.category === "Clause" || item.category === "ContentClause"
        || item.category === "RelativeClause" || item.category === "QuotedClause"));
    expect(embedded.length).toBeGreaterThan(0);
    expect(embedded.every((item) => item.recursive)).toBe(true);
  });

  it("uses complementType features without lexical compatibility lists", () => {
    const serialized = JSON.stringify(COMPLEMENT_PRODUCTION_RULES);
    expect(serialized).toContain('"complementType"');
    expect(serialized).not.toContain('"text"');
    expect(serialized).not.toContain('"plausibility"');
  });
});

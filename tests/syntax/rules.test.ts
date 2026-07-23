import { describe, expect, it } from "vitest";
import {
  FORMAL_SYNTAX_FIXTURES,
  FORMAL_SYNTAX_RULES,
  PHRASE_PRODUCTION_RULES,
} from "../../src/syntax/rules.js";
import { UPOS_VALUES } from "../../src/syntax/types.js";
import { validateGrammarBundle } from "../../src/syntax/validate.js";

describe("formal phrase production inventory", () => {
  it("validates every rule and concrete positive/negative fixture", () => {
    expect(validateGrammarBundle(FORMAL_SYNTAX_RULES, FORMAL_SYNTAX_FIXTURES).errors)
      .toEqual([]);
  });

  it("makes all 17 UD UPOS values structurally reachable", () => {
    const reachable = new Set(PHRASE_PRODUCTION_RULES.flatMap((rule) =>
      rule.constituents.flatMap((item) => item.allowedUpos)));
    expect([...reachable].sort()).toEqual([...UPOS_VALUES].sort());
  });

  it("locks phrase repetition to the declared termination bounds", () => {
    const noun = PHRASE_PRODUCTION_RULES.find(
      (rule) => rule.id === "phrase.noun.expanded",
    );
    const verb = PHRASE_PRODUCTION_RULES.find(
      (rule) => rule.id === "phrase.verb.expanded",
    );
    expect(noun?.constituents.find((item) => item.key === "modifier")?.maximum)
      .toBe(3);
    expect(verb?.constituents.find((item) => item.key === "adverbial")?.maximum)
      .toBe(3);
    expect(verb?.constituents.find((item) => item.key === "complement")?.maximum)
      .toBe(2);
  });

  it("fixtures exercise optional constituents both absent and maximally present", () => {
    const minimum = FORMAL_SYNTAX_FIXTURES.find(
      (fixture) => fixture.id === "phrase.verb.expanded:minimum",
    );
    const maximum = FORMAL_SYNTAX_FIXTURES.find(
      (fixture) => fixture.id === "phrase.verb.expanded:maximum",
    );
    expect(minimum?.constituentCounts).toMatchObject({
      negation: 0,
      modal: 0,
      adverbial: 0,
      complement: 0,
      object: 0,
      aspect: 0,
    });
    expect(maximum?.constituentCounts).toMatchObject({
      negation: 1,
      modal: 2,
      adverbial: 3,
      complement: 2,
      object: 2,
      aspect: 1,
    });
  });
});

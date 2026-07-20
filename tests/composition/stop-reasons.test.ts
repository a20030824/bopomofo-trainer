import { describe, expect, it } from "vitest";
import { composePracticeSequence } from "../../src/composition/composer.js";
import {
  budget,
  entry,
  input,
  relationIndex,
  transitionOccurrence,
} from "./helpers.js";

function oneCandidate() {
  const exact = entry("word:exact", [["ㄓ", "ㄨ", "tone:1"]]);
  return {
    exact,
    index: relationIndex({
      transitions: [transitionOccurrence(exact, "ㄓ", "ㄨ")],
    }),
  };
}

describe("composition stop reasons", () => {
  it("reports target-satisfied", () => {
    const { exact, index } = oneCandidate();
    const result = composePracticeSequence(input({ entries: [exact], index }));
    expect(result.stopReason).toBe("target-satisfied");
  });

  it("reports token-budget-exhausted", () => {
    const { exact, index } = oneCandidate();
    const result = composePracticeSequence(input({
      entries: [exact],
      index,
      budget: budget({ maximumTokens: 2 }),
    }));
    expect(result.stopReason).toBe("token-budget-exhausted");
  });

  it("reports syllable-budget-exhausted", () => {
    const { exact, index } = oneCandidate();
    const result = composePracticeSequence(input({
      entries: [exact],
      index,
      budget: budget({ maximumSyllables: 0 }),
    }));
    expect(result.stopReason).toBe("syllable-budget-exhausted");
  });

  it("reports boundary-budget-exhausted", () => {
    const first = entry("word:first", [["ㄓ", "ㄨ", "tone:1"]]);
    const second = entry("word:second", [["ㄓ", "ㄨ", "tone:2"]]);
    const result = composePracticeSequence(input({
      entries: [first, second],
      index: relationIndex({
        transitions: [
          transitionOccurrence(first, "ㄓ", "ㄨ"),
          transitionOccurrence(second, "ㄓ", "ㄨ"),
        ],
      }),
      budget: budget({
        targetExposures: { minimum: 2, preferred: 2, maximum: 2 },
        maximumLexicalBoundaries: 0,
      }),
    }));
    expect(result.items).toHaveLength(1);
    expect(result.stopReason).toBe("boundary-budget-exhausted");
  });

  it("reports no-supporting-candidates", () => {
    const unrelated = entry("word:unrelated", [["ㄓ", "ㄣ", "tone:1"]]);
    const result = composePracticeSequence(input({
      entries: [unrelated],
      index: relationIndex(),
    }));
    expect(result.stopReason).toBe("no-supporting-candidates");
  });

  it("reports insufficient-diverse-support", () => {
    const { exact, index } = oneCandidate();
    const result = composePracticeSequence(input({
      entries: [exact],
      index,
      budget: budget({ maximumRelationConcentration: 0.5 }),
    }));
    expect(result.stopReason).toBe("insufficient-diverse-support");
  });

  it("reports marginal-gain-below-threshold", () => {
    const { exact, index } = oneCandidate();
    const result = composePracticeSequence(input({
      entries: [exact],
      index,
      budget: budget({ marginalGainThreshold: 2 }),
    }));
    expect(result.stopReason).toBe("marginal-gain-below-threshold");
  });

  it("reports policy-conflict", () => {
    const { exact, index } = oneCandidate();
    const result = composePracticeSequence(input({
      objective: { kind: "coverage", relationKinds: ["transition"] },
      entries: [exact],
      index,
    }));
    expect(result.stopReason).toBe("policy-conflict");
    expect(result.fallbackReasons).toContain("coverage-objective-not-composable");
  });

  it("reports fallback-completed without padding to six entries", () => {
    const { exact, index } = oneCandidate();
    const result = composePracticeSequence(input({
      entries: [exact],
      index,
      budget: budget({
        targetExposures: { minimum: 1, preferred: 2, maximum: 2 },
        maximumSameEntryRepetition: 1,
      }),
    }));
    expect(result.items).toHaveLength(1);
    expect(result.stopReason).toBe("fallback-completed");
    expect(result.fallbackReasons).toEqual([
      "support-exhausted-before-preferred",
      "minimum-met-preferred-unreachable",
      "partial-sequence-retained",
    ]);
  });
});

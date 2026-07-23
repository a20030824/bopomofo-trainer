import { describe, expect, it } from "vitest";
import type { CatalogEntry, RandomSource } from "../../src/core/model.js";
import { composeFormalSyntaxUtterances } from "../../src/curriculum/formal-syntax-utterance.js";
import { FORMAL_GRAMMAR_VERSION } from "../../src/syntax/features.js";
import type { ProductionRule, SyntaxProfile } from "../../src/syntax/types.js";

class SequenceRandom implements RandomSource {
  private index = 0;
  constructor(private readonly values: readonly number[]) {}
  next(): number {
    const value = this.values[this.index % this.values.length] ?? 0;
    this.index += 1;
    return value;
  }
}

function entry(id: string, text: string, frequencyBand: 1 | 2 | 3): CatalogEntry {
  return {
    id,
    prompt: { text, locale: "zh-TW" },
    syllables: [{ tokens: ["zhuyin:ㄅ", "tone:1"] }],
    frequencyBand,
    tags: ["test"],
    provenanceIds: ["test"],
  };
}

function profile(id: string, entryId: string): SyntaxProfile {
  return {
    id,
    entryId,
    upos: "NOUN",
    functions: ["subject"],
    valencyFrames: ["avalent"],
    provenanceIds: ["test"],
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

const rules: readonly ProductionRule[] = [
  {
    id: "sentence.test",
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
    positiveFixtureIds: ["sentence.test:positive"],
    negativeFixtureIds: ["sentence.test:negative"],
  },
];

const punctuatedRules: readonly ProductionRule[] = [{
  ...rules[0]!,
  id: "sentence.test-punctuated",
  constituents: [
    ...rules[0]!.constituents,
    {
      key: "punctuation",
      category: "Lexeme",
      minimum: 1,
      maximum: 1,
      recursive: false,
      allowedUpos: ["PUNCT"],
      requiredFunctions: [],
      requiredValencyFrames: [],
      requiredFeatures: {},
    },
  ],
  surfaceOrders: [{
    id: "canonical",
    constituentKeys: ["subject", "punctuation"],
  }],
  positiveFixtureIds: ["sentence.test-punctuated:positive"],
  negativeFixtureIds: ["sentence.test-punctuated:negative"],
}];

const twoSlotRules: readonly ProductionRule[] = [{
  ...rules[0]!,
  id: "sentence.test-two-slots",
  constituents: [
    { ...rules[0]!.constituents[0]!, key: "first" },
    { ...rules[0]!.constituents[0]!, key: "second" },
  ],
  surfaceOrders: [{
    id: "canonical",
    constituentKeys: ["first", "second"],
  }],
  positiveFixtureIds: ["sentence.test-two-slots:positive"],
  negativeFixtureIds: ["sentence.test-two-slots:negative"],
}];

describe("frequency-first formal syntax compatibility composer", () => {
  it("uses only stage-eligible entries and returns a formal candidate", () => {
    const eligible = entry("entry:eligible", "甲", 1);
    const excluded = entry("entry:excluded", "乙", 3);
    const result = composeFormalSyntaxUtterances({
      eligibleEntries: [eligible],
      profiles: [
        profile("profile:eligible", eligible.id),
        profile("profile:excluded", excluded.id),
      ],
      random: new SequenceRandom([0]),
      maximumCandidates: 1,
      maximumAttempts: 1,
      rules,
    });
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      kind: "formal-syntax",
      text: "甲",
      templateId: null,
    });
    expect(result.candidates[0]?.entries.map((item) => item.id)).toEqual([eligible.id]);
  });

  it("keeps punctuation separate from candidate text", () => {
    const eligible = entry("entry:eligible", "甲", 1);
    const result = composeFormalSyntaxUtterances({
      eligibleEntries: [eligible],
      profiles: [profile("profile:eligible", eligible.id)],
      random: new SequenceRandom([0]),
      maximumCandidates: 1,
      maximumAttempts: 1,
      rules: punctuatedRules,
    });
    expect(result.candidates[0]).toMatchObject({
      text: "甲",
      punctuation: "。",
    });
  });

  it("applies explicit post-eligibility entry weights", () => {
    const first = entry("entry:first", "甲", 1);
    const second = entry("entry:second", "乙", 1);
    const result = composeFormalSyntaxUtterances({
      eligibleEntries: [first, second],
      profiles: [profile("profile:first", first.id), profile("profile:second", second.id)],
      entryWeightsById: { [first.id]: 0, [second.id]: 1 },
      random: new SequenceRandom([0]),
      maximumCandidates: 1,
      maximumAttempts: 1,
      rules,
    });
    expect(result.candidates[0]?.entries.map((item) => item.id)).toEqual([second.id]);
  });

  it("does not multiply entry weight by compatible profile count", () => {
    const first = entry("entry:first", "甲", 1);
    const second = entry("entry:second", "乙", 1);
    const result = composeFormalSyntaxUtterances({
      eligibleEntries: [first, second],
      profiles: [
        profile("profile:first-a", first.id),
        profile("profile:first-b", first.id),
        profile("profile:second", second.id),
      ],
      random: new SequenceRandom([0, 0, 0.6]),
      maximumCandidates: 1,
      maximumAttempts: 1,
      rules,
    });
    expect(result.candidates[0]?.entries.map((item) => item.id)).toEqual([second.id]);
  });

  it("does not reuse one entry in multiple lexical slots", () => {
    const first = entry("entry:first", "甲", 1);
    const second = entry("entry:second", "乙", 1);
    const result = composeFormalSyntaxUtterances({
      eligibleEntries: [first, second],
      profiles: [profile("profile:first", first.id), profile("profile:second", second.id)],
      random: new SequenceRandom([0]),
      maximumCandidates: 1,
      maximumAttempts: 1,
      rules: twoSlotRules,
    });
    expect(result.candidates[0]?.entries.map((item) => item.id)).toEqual([
      first.id,
      second.id,
    ]);
  });

  it("fails closed without silently assigning a missing profile", () => {
    const result = composeFormalSyntaxUtterances({
      eligibleEntries: [entry("entry:eligible", "甲", 1)],
      profiles: [],
      random: new SequenceRandom([0]),
      maximumCandidates: 1,
      maximumAttempts: 1,
      rules,
    });
    expect(result.candidates).toEqual([]);
    expect(result.fallbackReasons).toContain("formal-syntax-no-candidate");
    expect(result.fallbackReasons).toContain("formal-syntax-unrealizable-shape");
  });
});

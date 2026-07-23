import { describe, expect, it } from "vitest";
import type { CatalogEntry } from "../../src/core/model.js";
import type { StructuralDerivationShape } from "../../src/syntax/derive.js";
import { FORMAL_GRAMMAR_VERSION } from "../../src/syntax/features.js";
import {
  buildLexicalProfileIndex,
  compatibleProfilesForSlot,
  realizeStructuralDerivation,
} from "../../src/syntax/realize.js";
import type { SyntaxProfile } from "../../src/syntax/types.js";

function entry(id: string, text: string): CatalogEntry {
  return {
    id,
    prompt: { text, locale: "zh-TW" },
    syllables: [{ tokens: ["zhuyin:ㄅ", "tone:1"] }],
    frequencyBand: 1,
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

const slot = {
  kind: "lexical-slot",
  id: "slot:subject",
  constituentKey: "subject",
  occurrenceIndex: 0,
  allowedUpos: ["NOUN"],
  requiredFunctions: ["subject"],
  requiredValencyFrames: [],
  requiredFeatures: {},
} as const;

const shape: StructuralDerivationShape = {
  id: "shape:test",
  grammarVersion: FORMAL_GRAMMAR_VERSION,
  root: {
    kind: "syntax-node",
    id: "node:test",
    category: "Sentence",
    productionRuleId: "sentence:test",
    surfaceOrderId: "canonical",
    children: [slot],
  },
  productionRulePath: ["sentence:test"],
  lexicalSlots: [slot],
  clauseCount: 0,
  lexicalSlotCount: 1,
};

describe("lazy lexical realization", () => {
  it("keeps every compatible profile individually reachable by slot offset", () => {
    const entries = [entry("entry:a", "甲"), entry("entry:b", "乙")];
    const profiles = [profile("profile:a", "entry:a"), profile("profile:b", "entry:b")];
    const index = buildLexicalProfileIndex(entries, profiles);
    expect(compatibleProfilesForSlot(slot, index).map((item) => item.id))
      .toEqual(["profile:a", "profile:b"]);
    expect(realizeStructuralDerivation(shape, {
      entries,
      profiles,
      profileOffsetsBySlotId: { [slot.id]: 0 },
    })?.entryIds).toEqual(["entry:a"]);
    expect(realizeStructuralDerivation(shape, {
      entries,
      profiles,
      profileOffsetsBySlotId: { [slot.id]: 1 },
    })?.entryIds).toEqual(["entry:b"]);
  });

  it("is deterministic for the same seed", () => {
    const entries = [entry("entry:a", "甲"), entry("entry:b", "乙")];
    const profiles = [profile("profile:a", "entry:a"), profile("profile:b", "entry:b")];
    const first = realizeStructuralDerivation(shape, { entries, profiles, seed: "fixed" });
    const second = realizeStructuralDerivation(shape, { entries, profiles, seed: "fixed" });
    expect(first).toEqual(second);
  });

  it("fails closed when a lexical slot has no compatible profile", () => {
    expect(realizeStructuralDerivation(shape, { entries: [], profiles: [] })).toBeNull();
  });

  it("realizes formal punctuation without a catalog entry", () => {
    const punctuationSlot = { ...slot, id: "slot:punct", allowedUpos: ["PUNCT"] } as const;
    const punctuationShape = {
      ...shape,
      lexicalSlots: [punctuationSlot],
      root: { ...shape.root, children: [punctuationSlot] },
    };
    expect(realizeStructuralDerivation(punctuationShape, {
      entries: [],
      profiles: [],
      punctuationToken: "？",
    })?.tokens).toEqual([{
      kind: "punctuation",
      value: "？",
      entryId: null,
      syntaxProfileId: null,
    }]);
  });
});

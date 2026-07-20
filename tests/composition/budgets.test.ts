import { describe, expect, it } from "vitest";
import { composePracticeSequence } from "../../src/composition/composer.js";
import { stableStringify } from "../../src/composition/stable.js";
import {
  bindingOccurrence,
  bindingObjective,
  budget,
  entry,
  input,
  policy,
  relationIndex,
  transitionOccurrence,
} from "./helpers.js";

describe("practice budgets and penalties", () => {
  it("trims target evidence at the maximum exposure budget", () => {
    const repeated = entry("word:triple", [["ㄓ", "ㄨ", "ㄓ", "ㄨ", "ㄓ", "ㄨ", "tone:1"]]);
    const result = composePracticeSequence(input({
      entries: [repeated],
      index: relationIndex({
        transitions: [
          transitionOccurrence(repeated, "ㄓ", "ㄨ", 0, 0),
          transitionOccurrence(repeated, "ㄓ", "ㄨ", 0, 2),
          transitionOccurrence(repeated, "ㄓ", "ㄨ", 0, 4),
        ],
      }),
      budget: budget({
        targetExposures: { minimum: 1, preferred: 2, maximum: 2 },
      }),
    }));
    expect(result.targetExposureCount).toBe(2);
    expect(result.items[0]?.targetEvidence[0]?.exactOccurrences).toHaveLength(2);
  });

  it("enforces minimum common-word share during candidate selection", () => {
    const rare = entry("word:rare", [["ㄓ", "ㄨ", "ㄓ", "ㄨ", "tone:1"]], 3);
    const common = entry("word:common", [["ㄓ", "ㄨ", "tone:1"]], 1);
    const result = composePracticeSequence(input({
      entries: [rare, common],
      index: relationIndex({
        transitions: [
          transitionOccurrence(rare, "ㄓ", "ㄨ", 0, 0),
          transitionOccurrence(rare, "ㄓ", "ㄨ", 0, 2),
          transitionOccurrence(common, "ㄓ", "ㄨ"),
        ],
      }),
      budget: budget({
        targetExposures: { minimum: 1, preferred: 2, maximum: 2 },
        minimumCommonWordShare: 0.5,
      }),
    }));
    expect(result.items.map((item) => item.entry.id)).toEqual(["word:common", "word:rare"]);
    expect(result.coverageSummary.commonWordShare).toBe(0.5);
  });

  it("enforces maximum same-entry repetition", () => {
    const exact = entry("word:repeat", [["ㄓ", "ㄨ", "tone:1"]]);
    const result = composePracticeSequence(input({
      entries: [exact],
      index: relationIndex({
        transitions: [transitionOccurrence(exact, "ㄓ", "ㄨ")],
      }),
      budget: budget({
        targetExposures: { minimum: 2, preferred: 2, maximum: 2 },
        maximumSameEntryRepetition: 1,
      }),
    }));
    expect(result.items).toHaveLength(1);
    expect(result.stopReason).toBe("insufficient-diverse-support");
    expect(result.selectionTrace[0]?.rankedCandidates[0]?.repetitionPenalty).toBe(0);
  });

  it("records and applies recent-entry penalty", () => {
    const recent = entry("word:recent", [["ㄓ", "ㄨ", "tone:1"]]);
    const fresh = entry("word:fresh", [["ㄓ", "ㄨ", "tone:2"]]);
    const result = composePracticeSequence(input({
      entries: [recent, fresh],
      index: relationIndex({
        transitions: [
          transitionOccurrence(recent, "ㄓ", "ㄨ"),
          transitionOccurrence(fresh, "ㄓ", "ㄨ"),
        ],
      }),
      history: { entryIds: [recent.id], tokenPathSignatures: [] },
      budget: budget({ recentEntryPenalty: 10 }),
    }));
    expect(result.items[0]?.entry.id).toBe(fresh.id);
    const recentScore = result.selectionTrace[0]?.rankedCandidates
      .find((candidate) => candidate.candidateEntryId === recent.id);
    expect(recentScore?.recentEntryPenalty).toBe(10);
  });

  it("records and applies recent token-path penalty", () => {
    const recentPath = entry("word:recent-path", [["ㄓ", "ㄨ", "tone:1"]]);
    const freshPath = entry("word:fresh-path", [["ㄓ", "ㄨ", "ㄥ", "tone:1"]]);
    const recentSignature = stableStringify(recentPath.syllables.map((syllable) => syllable.tokens));
    const result = composePracticeSequence(input({
      entries: [recentPath, freshPath],
      index: relationIndex({
        transitions: [
          transitionOccurrence(recentPath, "ㄓ", "ㄨ"),
          transitionOccurrence(freshPath, "ㄓ", "ㄨ"),
        ],
      }),
      history: { entryIds: [], tokenPathSignatures: [recentSignature] },
      budget: budget({ recentTokenPathPenalty: 10 }),
    }));
    expect(result.items[0]?.entry.id).toBe(freshPath.id);
    const recentScore = result.selectionTrace[0]?.rankedCandidates
      .find((candidate) => candidate.candidateEntryId === recentPath.id);
    expect(recentScore?.recentTokenPathPenalty).toBe(10);
  });

  it("records frequency contribution and repetition penalty", () => {
    const common = entry("word:common", [["ㄓ", "tone:1"]], 1);
    const rare = entry("word:rare", [["ㄓ", "tone:2"]], 3);
    const result = composePracticeSequence(input({
      objective: bindingObjective("ㄓ"),
      entries: [common, rare],
      index: relationIndex({
        bindings: [
          bindingOccurrence(common, "ㄓ"),
          bindingOccurrence(rare, "ㄓ"),
        ],
      }),
      budget: budget({
        targetExposures: { minimum: 2, preferred: 2, maximum: 2 },
        maximumSameEntryRepetition: 2,
      }),
    }));
    expect(result.items.map((item) => item.entry.id)).toEqual([common.id, common.id]);
    expect(result.selectionTrace[0]?.frequencyContribution).toBe(1);
    const repeatedCommon = result.selectionTrace[1]?.rankedCandidates
      .find((candidate) => candidate.candidateEntryId === common.id);
    expect(repeatedCommon?.repetitionPenalty).toBe(1);
  });

  it("diversity-aware greedy avoids a recently used token path", () => {
    const first = entry("word:a", [["ㄓ", "ㄨ", "tone:1"]]);
    const samePath = entry("word:b", [["ㄓ", "ㄨ", "tone:1"]]);
    const differentPath = entry("word:c", [["ㄓ", "ㄨ", "ㄥ", "tone:1"]]);
    const result = composePracticeSequence(input({
      entries: [first, samePath, differentPath],
      index: relationIndex({
        transitions: [
          transitionOccurrence(first, "ㄓ", "ㄨ"),
          transitionOccurrence(samePath, "ㄓ", "ㄨ"),
          transitionOccurrence(differentPath, "ㄓ", "ㄨ"),
        ],
      }),
      budget: budget({
        targetExposures: { minimum: 2, preferred: 2, maximum: 2 },
      }),
      policy: policy("diversity-aware-greedy"),
    }));
    expect(result.items.map((item) => item.entry.id)).toEqual([first.id, differentPath.id]);
    const samePathScore = result.selectionTrace[1]?.rankedCandidates
      .find((candidate) => candidate.candidateEntryId === samePath.id);
    expect(samePathScore?.diversityPenalty).toBeGreaterThan(
      result.selectionTrace[1]?.diversityPenalty ?? Number.POSITIVE_INFINITY,
    );
  });
});

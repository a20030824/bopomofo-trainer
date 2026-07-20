import { describe, expect, it } from "vitest";
import { composePracticeSequence } from "../../src/composition/composer.js";
import {
  budget,
  entry,
  input,
  policy,
  relationIndex,
  sequenceRandom,
  transitionOccurrence,
} from "./helpers.js";

describe("composition strategies", () => {
  it("is byte-for-byte deterministic for identical input and seeded random sequence", () => {
    const alpha = entry("word:alpha", [["ㄓ", "ㄨ", "tone:1"]]);
    const beta = entry("word:beta", [["ㄓ", "ㄨ", "tone:2"]]);
    const index = relationIndex({
      transitions: [
        transitionOccurrence(alpha, "ㄓ", "ㄨ"),
        transitionOccurrence(beta, "ㄓ", "ㄨ"),
      ],
    });
    const make = () => composePracticeSequence(input({
      entries: [beta, alpha],
      index,
      budget: budget({
        targetExposures: { minimum: 2, preferred: 2, maximum: 2 },
      }),
      policy: policy("bounded-beam-search", 3),
      random: sequenceRandom([0.25, 0.75]),
    }));

    expect(JSON.stringify(make())).toBe(JSON.stringify(make()));
  });

  it("keeps fixed-six as a baseline and does not pad unsupported entries", () => {
    const exact = entry("word:only", [["ㄓ", "ㄨ", "tone:1"]]);
    const result = composePracticeSequence(input({
      entries: [exact],
      index: relationIndex({
        transitions: [transitionOccurrence(exact, "ㄓ", "ㄨ")],
      }),
      budget: budget({
        targetExposures: { minimum: 1, preferred: 6, maximum: 6 },
      }),
      policy: policy("fixed-six-baseline"),
    }));

    expect(result.items).toHaveLength(1);
    expect(result.items.every((item) => item.entry.id === exact.id)).toBe(true);
    expect(result.stopReason).toBe("fallback-completed");
  });

  it("compares at least three composers on coverage, cost, and repetition", () => {
    const long = entry(
      "word:long",
      [["ㄓ", "ㄨ", "ㄓ", "ㄨ", "ㄓ", "ㄨ", "ㄥ", "tone:1"]],
    );
    const short = entry("word:short", [["ㄓ", "ㄨ"]]);
    const index = relationIndex({
      transitions: [
        transitionOccurrence(long, "ㄓ", "ㄨ", 0, 0),
        transitionOccurrence(long, "ㄓ", "ㄨ", 0, 2),
        transitionOccurrence(long, "ㄓ", "ㄨ", 0, 4),
        transitionOccurrence(short, "ㄓ", "ㄨ"),
      ],
    });
    const shared = {
      entries: [long, short],
      index,
      budget: budget({
        targetExposures: { minimum: 3, preferred: 3, maximum: 3 },
        maximumSameEntryRepetition: 3,
      }),
    } as const;
    const marginal = composePracticeSequence(input({
      ...shared,
      policy: policy("greedy-marginal-gain"),
    }));
    const perToken = composePracticeSequence(input({
      ...shared,
      policy: policy("greedy-gain-per-token"),
    }));
    const diversity = composePracticeSequence(input({
      ...shared,
      policy: policy("diversity-aware-greedy"),
    }));
    const comparison = [marginal, perToken, diversity].map((sequence) => ({
      strategy: sequence.strategy,
      coverage: sequence.targetExposureCount,
      tokenCost: sequence.tokenCount,
      repetitions: sequence.items.length
        - new Set(sequence.items.map((item) => item.entry.id)).size,
    }));

    expect(comparison).toEqual([
      {
        strategy: "greedy-marginal-gain",
        coverage: 3,
        tokenCost: 8,
        repetitions: 0,
      },
      {
        strategy: "greedy-gain-per-token",
        coverage: 3,
        tokenCost: 6,
        repetitions: 2,
      },
      {
        strategy: "diversity-aware-greedy",
        coverage: 3,
        tokenCost: 8,
        repetitions: 0,
      },
    ]);
  });

  it("beam search records path-level reasons for higher-ranked legal alternatives", () => {
    const long = entry(
      "word:long",
      [["ㄓ", "ㄨ", "ㄓ", "ㄨ", "tone:1"]],
    );
    const shortA = entry("word:short-a", [["ㄓ", "ㄨ"]]);
    const shortB = entry("word:short-b", [["ㄓ", "ㄨ"]]);
    const result = composePracticeSequence(input({
      entries: [long, shortA, shortB],
      index: relationIndex({
        transitions: [
          transitionOccurrence(long, "ㄓ", "ㄨ", 0, 0),
          transitionOccurrence(long, "ㄓ", "ㄨ", 0, 2),
          transitionOccurrence(shortA, "ㄓ", "ㄨ"),
          transitionOccurrence(shortB, "ㄓ", "ㄨ"),
        ],
      }),
      budget: budget({
        targetExposures: { minimum: 2, preferred: 2, maximum: 2 },
      }),
      policy: policy("bounded-beam-search", 4),
      random: sequenceRandom([0.1, 0.2, 0.3]),
    }));

    expect(result.stopReason).toBe("target-satisfied");
    for (const trace of result.selectionTrace) {
      expect(trace.rankedCandidates.length).toBeGreaterThan(0);
      expect(trace.higherRankedAlternativeRejections.every((rejection) =>
        rejection.reasonCodes.length > 0)).toBe(true);
    }
  });
});

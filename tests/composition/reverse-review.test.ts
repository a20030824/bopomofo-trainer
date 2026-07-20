import { describe, expect, it } from "vitest";
import { composePracticeSequence } from "../../src/composition/composer.js";
import {
  budget,
  entry,
  input,
  relationIndex,
  sequenceRandom,
  transitionOccurrence,
} from "./helpers.js";

describe("composer reverse review", () => {
  it("deduplicates polluted occurrence rows instead of double counting", () => {
    const exact = entry("word:exact", [["ㄓ", "ㄨ", "tone:1"]]);
    const occurrence = transitionOccurrence(exact, "ㄓ", "ㄨ");
    const result = composePracticeSequence(input({
      entries: [exact],
      index: relationIndex({ transitions: [occurrence, occurrence] }),
      budget: budget({
        targetExposures: { minimum: 1, preferred: 2, maximum: 2 },
      }),
    }));

    expect(result.targetExposureCount).toBe(1);
    expect(result.coverageSummary.targets[0]).toMatchObject({
      achievedExposures: 1,
      distinctSupportingEntries: 1,
    });
    expect(result.retrievalTrace.exclusions).toContainEqual(expect.objectContaining({
      entryId: exact.id,
      reason: "duplicate-index-occurrence",
    }));
  });

  it("distinguishes occurrence exposure from distinct supporting entries", () => {
    const repeated = entry("word:repeated", [["ㄓ", "ㄨ", "ㄓ", "ㄨ", "tone:1"]]);
    const result = composePracticeSequence(input({
      entries: [repeated],
      index: relationIndex({
        transitions: [
          transitionOccurrence(repeated, "ㄓ", "ㄨ", 0, 0),
          transitionOccurrence(repeated, "ㄓ", "ㄨ", 0, 2),
        ],
      }),
      budget: budget({
        targetExposures: { minimum: 2, preferred: 2, maximum: 2 },
      }),
    }));

    expect(result.coverageSummary.targets[0]).toMatchObject({
      achievedExposures: 2,
      distinctSupportingEntries: 1,
    });
  });

  it("counts lexical boundaries only between selected entries", () => {
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
      }),
    }));

    expect(result.boundaryCount).toBe(1);
    expect(result.budgetUsage.lexicalBoundaries).toBe(1);
    expect(result.selectionTrace.map((trace) => trace.boundaryCost)).toEqual([0, 1]);
  });

  it("is invariant to input catalog ordering when the seed stream is reset", () => {
    const alpha = entry("word:alpha", [["ㄓ", "ㄨ", "tone:1"]]);
    const beta = entry("word:beta", [["ㄓ", "ㄨ", "tone:2"]]);
    const index = relationIndex({
      transitions: [
        transitionOccurrence(alpha, "ㄓ", "ㄨ"),
        transitionOccurrence(beta, "ㄓ", "ㄨ"),
      ],
    });
    const make = (entries: readonly typeof alpha[]) => composePracticeSequence(input({
      entries,
      index,
      budget: budget({
        targetExposures: { minimum: 2, preferred: 2, maximum: 2 },
      }),
      random: sequenceRandom([0.2, 0.8]),
    }));

    expect(JSON.stringify(make([alpha, beta]))).toBe(JSON.stringify(make([beta, alpha])));
  });
});

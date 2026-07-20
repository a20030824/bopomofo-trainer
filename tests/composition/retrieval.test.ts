import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { CatalogEntry } from "../../src/core/model.js";
import { composePracticeSequence } from "../../src/composition/composer.js";
import type { TransitionOccurrence } from "../../src/relations/types.js";
import {
  bindingOccurrence,
  budget,
  entry,
  input,
  relationIndex,
  transitionObjective,
  transitionOccurrence,
} from "./helpers.js";

interface TransitionFixture {
  readonly objective: {
    readonly fromToken: string;
    readonly toToken: string;
  };
  readonly entries: readonly {
    readonly id: string;
    readonly text: string;
    readonly syllables: readonly (readonly string[])[];
    readonly frequencyBand: 1 | 2 | 3;
  }[];
  readonly indexedOccurrences: readonly {
    readonly entryId: string;
    readonly syllableIndex: number;
    readonly fromTokenIndex: number;
    readonly fromToken: string;
    readonly toToken: string;
  }[];
}

function loadTransitionFixture(): {
  readonly fixture: TransitionFixture;
  readonly entries: readonly CatalogEntry[];
  readonly occurrences: readonly TransitionOccurrence[];
} {
  const fixture = JSON.parse(readFileSync(
    new URL("../../data/fixtures/composition/exact-transition.json", import.meta.url),
    "utf8",
  )) as TransitionFixture;
  const entries = fixture.entries.map((item) => entry(
    item.id,
    item.syllables,
    item.frequencyBand,
  ));
  const entryMap = new Map(entries.map((item) => [item.id, item]));
  const occurrences = fixture.indexedOccurrences.map((item): TransitionOccurrence => {
    const catalogEntry = entryMap.get(item.entryId)!;
    return {
      kind: "transition",
      entryId: item.entryId,
      syllableIndex: item.syllableIndex,
      fromTokenIndex: item.fromTokenIndex,
      fromToken: item.fromToken,
      toToken: item.toToken,
      frequencyBand: catalogEntry.frequencyBand,
      tags: catalogEntry.tags,
      provenanceIds: catalogEntry.provenanceIds,
      partition: "training",
    };
  });
  return { fixture, entries, occurrences };
}

describe("composition retrieval", () => {
  it("accepts only exact same-syllable adjacent ㄓ→ㄨ support, even with poisoned index rows", () => {
    const { fixture, entries, occurrences } = loadTransitionFixture();
    const sequence = composePracticeSequence(input({
      objective: transitionObjective(
        fixture.objective.fromToken,
        fixture.objective.toToken,
      ),
      entries,
      index: relationIndex({ transitions: occurrences }),
      budget: budget({
        targetExposures: { minimum: 1, preferred: 1, maximum: 3 },
      }),
    }));

    expect(sequence.items.map((item) => item.entry.id)).toEqual(["word:exact-adjacent"]);
    expect(sequence.items[0]?.targetEvidence[0]?.exactOccurrences).toHaveLength(1);
    expect(sequence.retrievalTrace.exclusions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        entryId: "word:same-syllable-nonadjacent",
        reason: "invalid-index-occurrence",
      }),
      expect.objectContaining({
        entryId: "word:cross-syllable",
        reason: "invalid-index-occurrence",
      }),
    ]));
  });

  it("rejects a relation index whose support scope differs from the objective", () => {
    const exact = entry("word:scope", [["ㄓ", "ㄨ", "tone:1"]]);
    const index = relationIndex({
      transitions: [transitionOccurrence(exact, "ㄓ", "ㄨ")],
    });
    const key = Object.keys(index.support)[0]!;
    const summary = index.support[key]!;
    const mismatched = {
      ...index,
      support: {
        ...index.support,
        [key]: {
          ...summary,
          relation: {
            kind: "transition" as const,
            scope: {
              ...summary.relation.scope,
              layoutId: "different-layout",
              fromToken: "ㄓ",
              toToken: "ㄨ",
            },
          },
        },
      },
    };
    const sequence = composePracticeSequence(input({
      entries: [exact],
      index: mismatched,
    }));

    expect(sequence.items).toEqual([]);
    expect(sequence.retrievalTrace.exclusions).toContainEqual(expect.objectContaining({
      reason: "inconsistent-objective-scope",
    }));
  });

  it("retains binding context instead of flattening occurrences", () => {
    const initial = entry("word:initial", [["ㄓ", "ㄨ", "tone:1"]]);
    const medial = entry("word:medial", [["ㄅ", "ㄓ", "tone:1"]]);
    const sequence = composePracticeSequence(input({
      objective: {
        kind: "binding",
        relation: {
          kind: "binding",
          scope: {
            mode: "guided",
            layoutId: "zhuyin-standard",
            tokenId: "ㄓ",
          },
        },
      },
      entries: [initial, medial],
      index: relationIndex({
        bindings: [
          bindingOccurrence(initial, "ㄓ", 0, 0),
          bindingOccurrence(medial, "ㄓ", 0, 1),
        ],
      }),
      budget: budget({
        targetExposures: { minimum: 2, preferred: 2, maximum: 2 },
      }),
    }));

    const occurrences = sequence.items.flatMap((item) =>
      item.targetEvidence.flatMap((evidence) => evidence.exactOccurrences));
    expect(occurrences).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "binding",
        context: "syllable-start",
        entryInitial: true,
      }),
      expect.objectContaining({
        kind: "binding",
        context: "within-syllable",
        entryInitial: false,
      }),
    ]));
  });

  it("represents confusion training as explicit contrast roles, not ordinary co-occurrence", () => {
    const expected = entry("word:expected", [["ㄓ", "ㄨ", "tone:1"]]);
    const actual = entry("word:actual", [["ㄔ", "ㄨ", "tone:1"]]);
    const relation = {
      kind: "confusion" as const,
      scope: {
        mode: "guided" as const,
        layoutId: "zhuyin-standard",
        expectedToken: "ㄓ",
        actualToken: "ㄔ",
      },
    };
    const sequence = composePracticeSequence(input({
      objective: { kind: "confusion", relation },
      entries: [expected, actual],
      index: relationIndex({
        bindings: [
          bindingOccurrence(expected, "ㄓ"),
          bindingOccurrence(actual, "ㄔ"),
        ],
        confusionPools: {
          pool: {
            relation,
            expectedEntryIds: [expected.id],
            actualEntryIds: [actual.id],
            sharedEntryIds: [],
          },
        },
      }),
      budget: budget({
        targetExposures: { minimum: 2, preferred: 2, maximum: 2 },
      }),
    }));

    const evidence = sequence.items.flatMap((item) => item.targetEvidence);
    expect(evidence.flatMap((item) => item.exactOccurrences)).toEqual([]);
    expect(evidence.flatMap((item) => item.contrastRequirements).map((item) => item.role))
      .toEqual(["actual", "expected"]);
    expect(sequence.coverageSummary.targets[0]).toMatchObject({
      exactOccurrenceCount: 0,
      contrastRequirementCount: 2,
    });
  });
});

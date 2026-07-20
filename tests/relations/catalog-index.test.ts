import { describe, expect, it } from "vitest";
import type { CatalogEntry } from "../../src/core/model.js";
import {
  bindingRelationKey,
  indexCatalogOccurrences,
  transitionRelationKey,
} from "../../src/relations/catalog-occurrences.js";
import { createCatalogRelationIndex } from "../../src/relations/catalog-index.js";
import { createRelationalCatalogReport } from "../../src/relations/catalog-report.js";
import { zhuyinToken, toneToken } from "../../src/scheme/tokens.js";

const entry: CatalogEntry = {
  id: "word:中文:test",
  prompt: { text: "中文", locale: "zh-TW" },
  syllables: [
    { tokens: [zhuyinToken("ㄓ"), zhuyinToken("ㄨ"), zhuyinToken("ㄥ"), toneToken(1)] },
    { tokens: [zhuyinToken("ㄨ"), zhuyinToken("ㄣ"), toneToken(2)] },
  ],
  frequencyBand: 1,
  tags: ["general"],
  provenanceIds: ["test"],
};

const partitions = { [entry.id]: "training" as const };

describe("relational catalog index", () => {
  it("indexes exact positions without crossing syllable boundaries", () => {
    const result = indexCatalogOccurrences([entry], partitions);
    expect(result.syllableCount).toBe(2);
    expect(result.tokenCount).toBe(7);
    expect(result.transitionCount).toBe(5);

    const zhiToWu = result.transitionOccurrences[
      transitionRelationKey(zhuyinToken("ㄓ"), zhuyinToken("ㄨ"))
    ];
    expect(zhiToWu).toEqual([
      expect.objectContaining({
        entryId: entry.id,
        syllableIndex: 0,
        fromTokenIndex: 0,
      }),
    ]);

    const falseBoundary = result.transitionOccurrences[
      transitionRelationKey(toneToken(1), zhuyinToken("ㄨ"))
    ];
    expect(falseBoundary).toBeUndefined();

    const firstTone = result.bindingOccurrences[bindingRelationKey(toneToken(1))];
    expect(firstTone).toEqual([
      expect.objectContaining({ context: "tone", syllableIndex: 0, tokenIndex: 3 }),
    ]);
  });

  it("includes theoretical unsupported relations and deterministic support", () => {
    const index = createCatalogRelationIndex([entry], {
      mode: "guided",
      layoutId: "zhuyin-standard",
      partitionByEntryId: partitions,
    });
    const supported = index.support[
      transitionRelationKey(zhuyinToken("ㄓ"), zhuyinToken("ㄨ"))
    ];
    expect(supported).toMatchObject({
      occurrenceCount: 1,
      trainingDistinctEntryCount: 1,
      supportState: "concentrated",
    });

    const reportA = createRelationalCatalogReport([entry], {
      mode: "guided",
      layoutId: "zhuyin-standard",
      partitionByEntryId: partitions,
    });
    const reportB = createRelationalCatalogReport([entry], {
      mode: "guided",
      layoutId: "zhuyin-standard",
      partitionByEntryId: partitions,
    });
    expect(JSON.stringify(reportA)).toBe(JSON.stringify(reportB));
    expect(reportA.unsupportedTransitionKeys.length).toBeGreaterThan(0);
  });
});

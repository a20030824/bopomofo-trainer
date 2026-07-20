import { describe, expect, it } from "vitest";
import type { CatalogEntry } from "../../src/core/model.js";
import { createRelationalCatalogReport } from "../../src/relations/catalog-report.js";
import { confusionRelationKey } from "../../src/relations/catalog-index.js";
import type { ConfusionRelationRef } from "../../src/relations/types.js";
import { STANDARD_BOPOMOFO_LAYOUT } from "../../src/scheme/standard-layout.js";
import { toneToken, zhuyinToken } from "../../src/scheme/tokens.js";

const BO = zhuyinToken("ㄅ");
const PO = zhuyinToken("ㄆ");
const TONE_1 = toneToken(1);

function entry(id: string, tokens: readonly (readonly string[])[]): CatalogEntry {
  return {
    id,
    prompt: { text: id, locale: "zh-TW" },
    syllables: tokens.map((syllable) => ({ tokens: syllable })),
    frequencyBand: 1,
    tags: ["confusion-pool-test"],
    provenanceIds: ["confusion-pool-test"],
  };
}

const entries = [
  entry("expected-only", [[BO, TONE_1]]),
  entry("actual-only", [[PO, TONE_1]]),
  entry("shared", [[BO, TONE_1], [PO, TONE_1]]),
] as const;

const relation: ConfusionRelationRef = {
  kind: "confusion",
  scope: {
    mode: "guided",
    layoutId: STANDARD_BOPOMOFO_LAYOUT.id,
    expectedToken: BO,
    actualToken: PO,
  },
};

function report(confusionRelations: readonly ConfusionRelationRef[]) {
  return createRelationalCatalogReport(entries, {
    mode: "guided",
    layoutId: STANDARD_BOPOMOFO_LAYOUT.id,
    partitionByEntryId: {
      "expected-only": "training",
      "actual-only": "evaluation",
      shared: "training",
    },
    confusionRelations,
  });
}

describe("catalog confusion contrast pools", () => {
  it("records deterministic directional expected, actual, and shared lexical support", () => {
    const result = report([relation]);
    const pool = result.index.confusionContrastPools[confusionRelationKey(relation)];

    expect(pool).toEqual({
      relation,
      expectedEntryIds: ["expected-only", "shared"],
      actualEntryIds: ["actual-only", "shared"],
      sharedEntryIds: ["shared"],
    });
  });

  it("includes confusion pools in the canonical report digest", () => {
    const withoutPool = report([]);
    const withPool = report([relation]);
    const replay = report([relation]);

    expect(withPool.determinismDigest).not.toBe(withoutPool.determinismDigest);
    expect(replay).toEqual(withPool);
  });

  it("rejects duplicate, self, and scope-mismatched confusion declarations", () => {
    expect(() => report([relation, relation])).toThrow("duplicate confusion relation");
    expect(() => report([{
      ...relation,
      scope: { ...relation.scope, actualToken: BO },
    }])).toThrow("confusion relation must use different expected and actual tokens");
    expect(() => report([{
      ...relation,
      scope: { ...relation.scope, layoutId: "other-layout" },
    }])).toThrow("confusion relation mode/layout does not match catalog index scope");
  });
});

import { describe, expect, it } from "vitest";
import { partitionCatalogForProduct } from "../../src/product/catalog-partition.js";
import { entry } from "./fixtures.js";

describe("product catalog partition", () => {
  it("reserves held-out entries without removing practice token coverage", () => {
    const source = Array.from({ length: 10 }, (_, index) => entry(`entry-${index + 1}`));
    const partition = partitionCatalogForProduct(source, 3);
    expect(partition.practice).toHaveLength(7);
    expect(partition.evaluation).toHaveLength(3);
    const practiceTokens = new Set(
      partition.practice.flatMap((item) => item.syllables.flatMap((syllable) => syllable.tokens)),
    );
    const sourceTokens = new Set(
      source.flatMap((item) => item.syllables.flatMap((syllable) => syllable.tokens)),
    );
    expect(practiceTokens).toEqual(sourceTokens);
  });

  it("fails rather than silently removing a uniquely supported token", () => {
    const source = [
      ...Array.from({ length: 5 }, (_, index) => entry(`common-${index + 1}`)),
      {
        ...entry("unique"),
        syllables: [{ tokens: ["zhuyin:ㄦ", "tone:1"] }],
      },
    ];
    expect(() => partitionCatalogForProduct(source, 2)).not.toThrow();
    const partition = partitionCatalogForProduct(source, 2);
    expect(partition.practice.some((item) => item.id === "unique")).toBe(true);
  });
});

import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("commonness module boundaries", () => {
  it("keeps NAER-specific imports out of curriculum", async () => {
    const source = await readFile(
      new URL(
        "../../src/curriculum/frequency-first-utterance.ts",
        import.meta.url,
      ),
      "utf8",
    );
    expect(source).not.toContain("naer-general-frequency");
    expect(source).toContain("commonness/catalog-projection");
  });
});

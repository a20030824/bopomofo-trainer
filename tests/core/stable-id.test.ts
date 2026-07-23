import { describe, expect, it } from "vitest";
import { stableRuntimeDigest } from "../../src/core/stable-id.js";

describe("browser-safe runtime identities", () => {
  it("is canonical, deterministic, and sensitive to content", () => {
    const first = stableRuntimeDigest({ text: "句子", nested: { b: 2, a: 1 } });
    const reordered = stableRuntimeDigest({ nested: { a: 1, b: 2 }, text: "句子" });
    expect(first).toBe(reordered);
    expect(first).toMatch(/^[0-9a-f]{64}$/u);
    expect(stableRuntimeDigest({ text: "別的句子" })).not.toBe(first);
  });
});

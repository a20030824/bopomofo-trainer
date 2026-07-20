import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { parseReferenceSourceManifests } from "../../src/reference/manifest-parser.js";
import { createReferenceSourceRegistry } from "../../src/reference/source-registry.js";

function manifest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "fixture",
    title: "Fixture",
    version: "1",
    homepageUrl: "https://example.invalid",
    downloadUrl: null,
    retrievedAt: null,
    checksumSha256: null,
    licenseLabel: "fixture",
    redistributionStatus: "unconfirmed",
    notes: [" note ", ""],
    ...overrides,
  };
}

describe("reference source manifests", () => {
  it("parses the committed source registry deterministically", async () => {
    const source = await readFile(
      new URL("../../data/reference-sources.json", import.meta.url),
      "utf8",
    );
    const manifests = parseReferenceSourceManifests(JSON.parse(source));
    const registry = createReferenceSourceRegistry(manifests);
    expect(Object.keys(registry)).toEqual([
      "moe:concised-dictionary:2014-20260626",
      "naer:general-frequency:2025-12-08",
      "naer:graded-words:2025-04",
    ]);
    expect(registry["naer:graded-words:2025-04"]?.redistributionStatus)
      .toBe("unconfirmed");
    expect(registry["moe:concised-dictionary:2014-20260626"]?.licenseLabel)
      .toBe("CC BY-ND 3.0 Taiwan");
  });

  it("normalizes notes and accepts real YYYY-MM-DD retrieval dates", () => {
    const [parsed] = parseReferenceSourceManifests([
      manifest({ retrievedAt: "2026-07-20" }),
    ]);
    expect(parsed).toMatchObject({
      retrievedAt: "2026-07-20",
      notes: ["note"],
    });
  });

  it.each([
    manifest({ homepageUrl: "http://example.com" }),
    manifest({ checksumSha256: "abc" }),
    manifest({ retrievedAt: "07/20/2026" }),
    manifest({ retrievedAt: "2026-02-30" }),
  ])("rejects invalid source metadata", (sourceManifest) => {
    expect(() => parseReferenceSourceManifests([sourceManifest])).toThrow();
  });
});

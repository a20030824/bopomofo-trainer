import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { parseReferenceSourceManifests } from "../../src/reference/manifest-parser.js";
import { createReferenceSourceRegistry } from "../../src/reference/source-registry.js";

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

  it("rejects invalid URLs and checksums", () => {
    expect(() => parseReferenceSourceManifests([{
      id: "bad",
      title: "Bad",
      version: "1",
      homepageUrl: "http://example.com",
      downloadUrl: null,
      retrievedAt: null,
      checksumSha256: "abc",
      licenseLabel: "unknown",
      redistributionStatus: "unconfirmed",
      notes: [],
    }])).toThrow();
  });
});

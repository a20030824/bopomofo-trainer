import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const INSPECTION_BRANCH = "agent/inspect-naer-frequency-workbook";
const shouldInspect = process.env.GITHUB_HEAD_REF === INSPECTION_BRANCH
  || process.env.RUN_NAER_INSPECTION === "1";

(shouldInspect ? describe : describe.skip)("NAER workbook transient CI inspection", () => {
  it("downloads the official XLSX transiently and emits structural reports only", () => {
    const outputDirectory = mkdtempSync(join(tmpdir(), "naer-inspection-output-"));
    try {
      execFileSync(
        "python3",
        [
          "scripts/inspect-naer-frequency-workbook.py",
          "--url",
          "https://coct.naer.edu.tw/file/files/%E9%80%9A%E7%94%A8%E8%A9%9E%E9%A0%BB%E8%A1%A8%20-%20%E5%AE%9A%E7%A8%BF1141208.xlsx",
          "--output-dir",
          outputDirectory,
        ],
        {
          cwd: process.cwd(),
          encoding: "utf8",
          timeout: 180_000,
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      const report = readFileSync(
        join(outputDirectory, "naer-frequency-workbook-inspection.json"),
        "utf8",
      );
      const markdown = readFileSync(
        join(outputDirectory, "naer-frequency-workbook-inspection.md"),
        "utf8",
      );
      const manifest = readFileSync(
        join(outputDirectory, "naer-frequency-workbook-manifest.json"),
        "utf8",
      );
      const parsed = JSON.parse(report) as {
        privacyBoundary: {
          sourceWorkbookRetained: boolean;
          lexicalRowsEmitted: boolean;
        };
        source: { checksumSha256: string; byteSize: number };
      };
      expect(parsed.privacyBoundary).toEqual(expect.objectContaining({
        sourceWorkbookRetained: false,
        lexicalRowsEmitted: false,
      }));
      expect(parsed.source.checksumSha256).toMatch(/^[a-f0-9]{64}$/u);
      expect(parsed.source.byteSize).toBeGreaterThan(0);
      console.log("NAER_INSPECTION_JSON_BEGIN");
      console.log(report.trim());
      console.log("NAER_INSPECTION_JSON_END");
      console.log("NAER_INSPECTION_MARKDOWN_BEGIN");
      console.log(markdown.trim());
      console.log("NAER_INSPECTION_MARKDOWN_END");
      console.log("NAER_INSPECTION_MANIFEST_BEGIN");
      console.log(manifest.trim());
      console.log("NAER_INSPECTION_MANIFEST_END");
    } finally {
      rmSync(outputDirectory, { recursive: true, force: true });
    }
  }, 190_000);
});

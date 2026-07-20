import { describe, expect, it } from "vitest";
import { compileReferenceRow } from "../../src/reference/compile-reference.js";
import { buildReferenceReviewQueue } from "../../src/reference/ranking.js";
import { createReferenceSourceRegistry } from "../../src/reference/source-registry.js";
import type {
  ReferenceCandidate,
  ReferenceSourceManifest,
  ReferenceSourceRow,
} from "../../src/reference/types.js";
import { transitionRelationKey } from "../../src/relations/catalog-occurrences.js";
import { toneToken, zhuyinToken } from "../../src/scheme/tokens.js";
import { createRealReferenceFixture } from "./real-report-fixture.js";

const manifest: ReferenceSourceManifest = {
  id: "fixture:naer",
  title: "Fixture Taiwan Mandarin words",
  version: "test-v1",
  homepageUrl: "https://example.invalid/fixture",
  downloadUrl: null,
  retrievedAt: null,
  checksumSha256: null,
  licenseLabel: "test fixture",
  redistributionStatus: "local-only",
  notes: [],
};
const sources = createReferenceSourceRegistry([manifest]);

function sourceRow(
  sourceRowId: string,
  text: string,
  reading: string,
  oralPerMillion: number,
  writtenPerMillion: number,
  levelOrdinal = 1,
): ReferenceSourceRow {
  return {
    sourceId: manifest.id,
    sourceRowId,
    text,
    reading,
    oralPerMillion,
    writtenPerMillion,
    level: String(levelOrdinal),
    levelOrdinal,
    domains: ["核心詞"],
    sourceRecordUrl: null,
  };
}

function compileCandidates(rows: readonly ReferenceSourceRow[]): readonly ReferenceCandidate[] {
  return rows.map((row) => {
    const result = compileReferenceRow(row, sources);
    if (!result.ok) throw new Error(result.error.message);
    return result.candidate;
  });
}

const rows = [
  sourceRow("1", "可樂", "ㄎㄜ3 ㄌㄜ4", 300, 200),
  sourceRow("2", "永遠", "ㄩㄥ3 ㄩㄢ3", 500, 400),
  sourceRow("3", "吃飯", "ㄔ1 ㄈㄢ4", 140, 60),
  sourceRow("4", "爸爸", "ㄅㄚ4 ㄅㄚ5", 806, 226),
  sourceRow("5", "中文", "ㄓㄨㄥ1 ㄨㄣ2", 100, 100),
  sourceRow("6", "可樂", "ㄎㄜ3 ㄌㄜ4", 300, 200),
] as const;

describe("reference word ranking", () => {
  it("prioritizes exact held-out transition repairs", async () => {
    const { report, reviewedIdentities } = await createRealReferenceFixture();
    const candidates = compileCandidates(rows);
    const queue = buildReferenceReviewQueue(
      candidates,
      report,
      "partition-repair",
      { reviewedIdentities },
    );

    expect(queue.ranked.slice(0, 2).map((item) => item.candidate.text))
      .toEqual(["可樂", "永遠"]);
    const cola = queue.ranked[0]!;
    expect(cola.components.partitionRepairTransitionCount).toBe(2);
    expect(new Set(cola.contribution.partitionRepairTransitionKeys)).toEqual(new Set([
      transitionRelationKey(zhuyinToken("ㄎ"), zhuyinToken("ㄜ")),
      transitionRelationKey(zhuyinToken("ㄜ"), toneToken(3)),
    ]));
    expect(queue.excluded).toEqual([
      expect.objectContaining({ candidateId: "reference:fixture:naer:5", reason: "already-reviewed" }),
      expect.objectContaining({ candidateId: "reference:fixture:naer:6", reason: "duplicate-reference-identity" }),
    ]);
  });

  it("changes priorities by named profile without changing contributions", async () => {
    const { report, reviewedIdentities } = await createRealReferenceFixture();
    const candidates = compileCandidates(rows.slice(0, 4));
    const binding = buildReferenceReviewQueue(
      candidates,
      report,
      "binding-broadening",
      { reviewedIdentities },
    );
    const transition = buildReferenceReviewQueue(
      candidates,
      report,
      "transition-broadening",
      { reviewedIdentities },
    );

    expect(binding.ranked[0]?.candidate.text).toBe("吃飯");
    expect(binding.ranked[0]?.components.rareOnlyBindingCount).toBe(1);
    expect(transition.ranked[0]?.candidate.text).toBe("可樂");
    expect(binding.ranked.find((item) => item.candidate.text === "可樂")?.contribution)
      .toEqual(transition.ranked.find((item) => item.candidate.text === "可樂")?.contribution);
  });

  it("is byte-for-byte deterministic across input order", async () => {
    const { report, reviewedIdentities } = await createRealReferenceFixture();
    const candidates = compileCandidates(rows);
    const forward = buildReferenceReviewQueue(
      candidates,
      report,
      "balanced-review",
      { reviewedIdentities },
    );
    const reverse = buildReferenceReviewQueue(
      [...candidates].reverse(),
      report,
      "balanced-review",
      { reviewedIdentities },
    );
    expect(JSON.stringify(forward)).toBe(JSON.stringify(reverse));
  });
});

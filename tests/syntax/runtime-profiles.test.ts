import { describe, expect, it } from "vitest";
import type { CatalogEntry } from "../../src/core/model.js";
import { sha256Canonical } from "../../src/reference/importers/canonical-json.js";
import { FORMAL_GRAMMAR_VERSION } from "../../src/syntax/features.js";
import {
  applyActiveCatalogSyntaxProfilesArtifact,
  type ActiveCatalogSyntaxProfilesArtifact,
} from "../../src/syntax/runtime-profiles.js";
import type { RuntimeSyntaxProfile } from "../../src/syntax/types.js";

function entry(id: string): CatalogEntry {
  return {
    id,
    prompt: { text: id, locale: "zh-TW" },
    syllables: [{ tokens: ["zhuyin:ㄅ", "tone:1"] }],
    frequencyBand: 1,
    tags: ["test"],
    provenanceIds: ["test"],
  };
}

function profile(entryId: string): RuntimeSyntaxProfile {
  return {
    id: `profile:${entryId}`,
    entryId,
    upos: "NOUN",
    functions: ["subject"],
    valencyFrames: ["avalent"],
    dependencyEvidence: {
      dependencyRelationCounts: { nsubj: 1 },
      surfacePositionCounts: { initial: 1 },
    },
    provenanceIds: ["ud:test"],
  };
}

function artifact(
  entries: readonly CatalogEntry[],
  profiles: readonly RuntimeSyntaxProfile[],
): ActiveCatalogSyntaxProfilesArtifact {
  const core = {
    schemaVersion: "formal-syntax-active-catalog-profiles-v1" as const,
    grammarVersion: FORMAL_GRAMMAR_VERSION,
    catalogEntryCount: entries.length,
    catalogDigest: sha256Canonical(entries),
    sourceSelectionDigest: "selection",
    sourceEvidenceDigest: "evidence",
    sourceProfileProjectionDigest: "projection",
    sourceProfileArtifactDigest: "profile-artifact",
    sourceRuleIndexDigest: "rule-index",
    profileCount: profiles.length,
    profiles,
  };
  return { ...core, determinismDigest: sha256Canonical(core) };
}

describe("active catalog runtime syntax profiles", () => {
  it("loads exact legal coverage", () => {
    const entries = [entry("one"), entry("two")];
    const profiles = entries.map((item) => profile(item.id));
    expect(applyActiveCatalogSyntaxProfilesArtifact(
      entries,
      new Set(entries.map((item) => item.id)),
      artifact(entries, profiles),
    )).toEqual(profiles);
  });

  it("rejects stale catalogs and missing legal profiles", () => {
    const entries = [entry("one"), entry("two")];
    const current = artifact(entries, [profile("one")]);
    expect(() => applyActiveCatalogSyntaxProfilesArtifact(
      entries,
      new Set(entries.map((item) => item.id)),
      current,
    )).toThrow(/cover every legal entry/u);
    expect(() => applyActiveCatalogSyntaxProfilesArtifact(
      [entries[0]!],
      new Set(["one"]),
      current,
    )).toThrow(/stale or invalid/u);
  });
});

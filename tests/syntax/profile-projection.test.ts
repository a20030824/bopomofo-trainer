import { describe, expect, it } from "vitest";
import type { CatalogEntry } from "../../src/core/model.js";
import {
  projectSyntaxProfiles,
  type SyntaxEvidenceArtifact,
} from "../../src/syntax/profile-projection.js";

function entry(text: string, reading: string): CatalogEntry {
  return {
    id: `word:${text}:${reading.replace(/\s+/gu, "-")}`,
    prompt: { text, locale: "zh-TW" },
    syllables: [{ tokens: ["zhuyin:ㄅ", "tone:1"] }],
    frequencyBand: 1,
    tags: ["test"],
    provenanceIds: ["test:syntax"],
  };
}

const nounEvidence = {
  upos: "NOUN",
  occurrenceCount: 4,
  dependencyRelationCounts: { obj: 4 },
  parentUposCounts: { VERB: 4 },
  headDirectionCounts: { "head-left": 4 },
  surfacePositionCounts: { final: 4 },
  childRelationCounts: {},
  childDirectionRelationCounts: {},
  childRelationMultisetCounts: { none: 4 },
  valencyRelationCounts: {},
  valencySignatureCounts: { none: 4 },
  constructionRelationCounts: {},
  anonymousDependencySkeletons: [],
} as const;

const verbEvidence = {
  upos: "VERB",
  occurrenceCount: 39,
  dependencyRelationCounts: { root: 39 },
  parentUposCounts: { ROOT: 39 },
  headDirectionCounts: { root: 39 },
  surfacePositionCounts: { medial: 39 },
  childRelationCounts: { obj: 20 },
  childDirectionRelationCounts: { "child-right:obj": 20 },
  childRelationMultisetCounts: { none: 19, "obj=1": 20 },
  valencyRelationCounts: { obj: 20 },
  valencySignatureCounts: { none: 19, "obj=1": 20 },
  constructionRelationCounts: {},
  anonymousDependencySkeletons: [],
} as const;

describe("syntax profile projection", () => {
  it("retains every UPOS and shares written-form evidence across readings", () => {
    const first = entry("東西", "ㄉㄨㄥ1 ㄒㄧ1");
    const second = entry("東西", "ㄉㄨㄥ1 ㄒㄧ5");
    const unseen = entry("無", "ㄨ2");
    const artifact: SyntaxEvidenceArtifact = {
      schemaVersion: "ud-syntax-evidence-v2",
      source: { sourceId: "ud:test" },
      rows: [{
        text: "東西",
        observed: true,
        occurrenceCount: 43,
        uposCounts: { NOUN: 4, VERB: 39 },
        syntaxProfileEvidence: [nounEvidence, verbEvidence, verbEvidence],
      }],
    };

    const result = projectSyntaxProfiles([first, second, unseen], artifact);
    expect(result.profilesByEntryId[first.id]?.map((profile) => profile.upos).sort())
      .toEqual(["NOUN", "VERB"]);
    expect(result.profilesByEntryId[second.id]?.map((profile) => profile.upos).sort())
      .toEqual(["NOUN", "VERB"]);
    expect(result.profilesByEntryId[first.id]).toHaveLength(2);
    expect(result.profilesByEntryId[second.id]).toHaveLength(2);
    expect(result.noUdEvidenceEntryIds).toEqual([unseen.id]);

    const firstVerb = result.profilesByEntryId[first.id]?.find(
      (profile) => profile.upos === "VERB",
    );
    const secondVerb = result.profilesByEntryId[second.id]?.find(
      (profile) => profile.upos === "VERB",
    );
    expect(firstVerb?.valencyFrames).toEqual([
      "ambitransitive",
      "intransitive",
      "transitive",
    ]);
    expect(firstVerb?.dependencyEvidence).toEqual(secondVerb?.dependencyEvidence);
    expect(firstVerb?.id).not.toBe(secondVerb?.id);
  });

  it("keeps all UPOS in a legacy aggregate artifact instead of choosing dominantUpos", () => {
    const item = entry("行", "ㄒㄧㄥ2");
    const result = projectSyntaxProfiles([item], {
      rows: [{
        text: "行",
        observed: true,
        occurrenceCount: 43,
        uposCounts: { NOUN: 4, VERB: 39 },
        dependencyRelationCounts: { root: 39, obj: 4 },
        valencySignatureCounts: { none: 23, "obj=1": 20 },
      }],
    });

    expect(result.profilesByEntryId[item.id]?.map((profile) => profile.upos).sort())
      .toEqual(["NOUN", "VERB"]);
    expect(result.profilesByEntryId[item.id]?.every(
      (profile) => profile.dependencyEvidence.evidenceScope === "aggregate-legacy",
    )).toBe(true);
  });

  it("fails closed when per-UPOS evidence omits an observed category", () => {
    const item = entry("行", "ㄒㄧㄥ2");
    expect(() => projectSyntaxProfiles([item], {
      rows: [{
        text: "行",
        observed: true,
        occurrenceCount: 43,
        uposCounts: { NOUN: 4, VERB: 39 },
        syntaxProfileEvidence: [verbEvidence],
      }],
    })).toThrow(/missing UPOS: NOUN/u);
  });
});

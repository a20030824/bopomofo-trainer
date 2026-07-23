import { describe, expect, it } from "vitest";
import {
  catalogEntryId,
  decodeCatalogEntries,
  decodeCatalogEntry,
  decodeSyntaxProfiles,
  deriveDependencyKeyTables,
  encodeCatalogEntries,
  encodeCatalogEntry,
  encodeSyntaxProfiles,
} from "../../src/app/catalog-codec.js";
import { compileCatalog } from "../../src/catalog/compile-catalog.js";
import { parseCsv } from "../../src/catalog/csv.js";
import type { CatalogCommonnessBase, CatalogEntry } from "../../src/core/model.js";
import type { RuntimeSyntaxProfile, Upos } from "../../src/syntax/types.js";

const CSV_HEADER = "text,reading,frequency_band,tags,status,provenance_ids";
const KNOWN_PROVENANCE_IDS = new Set(["local:sample-v1"]);

function compileOne(text: string, reading: string): CatalogEntry {
  const csv = parseCsv(`${CSV_HEADER}\n${text},${reading},1,general,provisional,local:sample-v1\n`);
  const result = compileCatalog(csv.records, KNOWN_PROVENANCE_IDS);
  const entry = result.entries[0];
  if (result.errors.length > 0 || entry === undefined) {
    throw new Error(`fixture failed to compile: ${JSON.stringify(result.errors)}`);
  }
  return entry;
}

const COMMONNESS_BASE: CatalogCommonnessBase = {
  modelVersion: "test-v1",
  sourceId: "test-source",
  sourceVersion: "1",
  sourceRowId: "1",
  spokenPerMillion: 12.5,
  writtenPerMillion: 8.25,
  spokenStrength: 0.9,
  writtenStrength: 0.7,
  score: 0.5,
  selectionWeight: 0.42,
  confidence: "reviewed",
  reasons: ["frequent"],
};

describe("catalogEntryId", () => {
  it("matches the id compileCatalog assigns for a multi-syllable word", () => {
    const entry = compileOne("交換", "ㄐㄧㄠ1 ㄏㄨㄢ4");
    expect(entry.id).toBe("word:交換:ㄐㄧㄠ1-ㄏㄨㄢ4");
    expect(catalogEntryId(entry.prompt.text, entry.syllables)).toBe(entry.id);
  });

  it("matches the id compileCatalog assigns for a single-syllable word", () => {
    const entry = compileOne("是", "ㄕ4");
    expect(catalogEntryId(entry.prompt.text, entry.syllables)).toBe(entry.id);
  });
});

describe("catalog entry encode/decode round trip", () => {
  it("round-trips an entry with a commonness base", () => {
    const source = compileOne("交換", "ㄐㄧㄠ1 ㄏㄨㄢ4");
    const entry: CatalogEntry = { ...source, commonnessBase: COMMONNESS_BASE };

    const decoded = decodeCatalogEntry(encodeCatalogEntry(entry));

    expect(decoded.id).toBe(entry.id);
    expect(decoded.prompt).toEqual(entry.prompt);
    expect(decoded.syllables).toEqual(entry.syllables);
    expect(decoded.frequencyBand).toBe(entry.frequencyBand);
    expect(decoded.commonnessBase?.selectionWeight).toBe(COMMONNESS_BASE.selectionWeight);
    expect(decoded.commonnessBase?.confidence).toBe("reviewed");
  });

  it("round-trips an entry without a commonness base", () => {
    const entry = compileOne("是", "ㄕ4");

    const decoded = decodeCatalogEntry(encodeCatalogEntry(entry));

    expect(decoded.id).toBe(entry.id);
    expect(decoded.commonnessBase).toBeUndefined();
    expect(decoded.tags).toEqual([]);
    expect(decoded.provenanceIds).toEqual([]);
  });

  it("preserves order and length across a list", () => {
    const entries = [
      compileOne("交換", "ㄐㄧㄠ1 ㄏㄨㄢ4"),
      compileOne("是", "ㄕ4"),
      { ...compileOne("媽媽", "ㄇㄚ1 ㄇㄚ5"), commonnessBase: COMMONNESS_BASE },
    ];

    const decoded = decodeCatalogEntries(encodeCatalogEntries(entries));

    expect(decoded.map((decodedEntry) => decodedEntry.id)).toEqual(entries.map((entry) => entry.id));
  });
});

describe("syntax profile encode/decode round trip", () => {
  const entries = [compileOne("交換", "ㄐㄧㄠ1 ㄏㄨㄢ4"), compileOne("是", "ㄕ4")];

  function profile(
    entryId: string,
    upos: Upos,
    dependencyRelationCounts: Record<string, number>,
  ): RuntimeSyntaxProfile {
    return {
      id: `source-profile:${entryId}:${upos}`,
      entryId,
      upos,
      functions: ["predicate", "modifier"],
      valencyFrames: ["transitive"],
      dependencyEvidence: {
        dependencyRelationCounts,
        surfacePositionCounts: { initial: 1, medial: 0, final: 1 },
      },
      provenanceIds: ["test"],
    };
  }

  const entryIds = entries.map((entry) => entry.id);
  const profiles: readonly RuntimeSyntaxProfile[] = [
    profile(entryIds[0] ?? "", "VERB", { nsubj: 28, obj: 0, obl: 5 }),
    profile(entryIds[1] ?? "", "AUX", { cop: 1 }),
  ];

  it("round-trips upos, functions, valency frames, and entry linkage", () => {
    const encoded = encodeSyntaxProfiles(profiles, entries);
    const decoded = decodeSyntaxProfiles(
      encoded.profiles,
      entries,
      encoded.relationKeys,
      encoded.positionKeys,
    );

    expect(decoded.map((decodedProfile) => decodedProfile.entryId)).toEqual(
      profiles.map((sourceProfile) => sourceProfile.entryId),
    );
    expect(decoded.map((decodedProfile) => decodedProfile.upos)).toEqual(
      profiles.map((sourceProfile) => sourceProfile.upos),
    );
    expect(decoded.map((decodedProfile) => decodedProfile.functions)).toEqual(
      profiles.map((sourceProfile) => sourceProfile.functions),
    );
    expect(decoded.map((decodedProfile) => decodedProfile.valencyFrames)).toEqual(
      profiles.map((sourceProfile) => sourceProfile.valencyFrames),
    );
  });

  it("collapses dependency counts to a present/absent key set, dropping zero counts", () => {
    const encoded = encodeSyntaxProfiles(profiles, entries);
    const decoded = decodeSyntaxProfiles(
      encoded.profiles,
      entries,
      encoded.relationKeys,
      encoded.positionKeys,
    );
    const [decodedFirst] = decoded;

    expect(decodedFirst?.dependencyEvidence.dependencyRelationCounts).toEqual({ nsubj: 1, obl: 1 });
    expect(decodedFirst?.dependencyEvidence.surfacePositionCounts).toEqual({ initial: 1, final: 1 });
  });

  it("produces unique ids for every decoded profile", () => {
    const encoded = encodeSyntaxProfiles(profiles, entries);
    const decoded = decodeSyntaxProfiles(
      encoded.profiles,
      entries,
      encoded.relationKeys,
      encoded.positionKeys,
    );

    expect(new Set(decoded.map((decodedProfile) => decodedProfile.id)).size).toBe(decoded.length);
  });
});

describe("deriveDependencyKeyTables", () => {
  it("returns the sorted union of present keys, including a key unique to one profile", () => {
    const entries = [compileOne("是", "ㄕ4")];
    const entryId = entries[0]?.id ?? "";
    const profiles: readonly RuntimeSyntaxProfile[] = [
      {
        id: "a",
        entryId,
        upos: "VERB",
        functions: [],
        valencyFrames: [],
        dependencyEvidence: {
          dependencyRelationCounts: { nsubj: 1, obj: 0 },
          surfacePositionCounts: { initial: 1 },
        },
        provenanceIds: [],
      },
      {
        id: "b",
        entryId,
        upos: "VERB",
        functions: [],
        valencyFrames: [],
        dependencyEvidence: {
          dependencyRelationCounts: { "acl:relcl": 3 },
          surfacePositionCounts: {},
        },
        provenanceIds: [],
      },
    ];

    const tables = deriveDependencyKeyTables(profiles);

    expect(tables.relationKeys).toEqual(["acl:relcl", "nsubj"]);
    expect(tables.positionKeys).toEqual(["initial"]);
  });
});

describe("decode fail-closed behavior", () => {
  const entries = [compileOne("是", "ㄕ4")];

  it("throws when an encoded catalog entry index is out of range", () => {
    expect(() => decodeSyntaxProfiles([[99, 0, [], [], [], []]], entries, [], [])).toThrow();
  });

  it("throws when an encoded upos index is out of range", () => {
    expect(() => decodeSyntaxProfiles([[0, 999, [], [], [], []]], entries, [], [])).toThrow();
  });
});

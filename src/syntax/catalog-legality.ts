import type { CatalogEntry } from "../core/model.js";
import { sha256Canonical } from "../reference/importers/canonical-json.js";
import { FORMAL_GRAMMAR_VERSION } from "./features.js";
import { FORMAL_SYNTAX_RULES } from "./grammar.js";
import { buildSyntaxRuleIndex, type SyntaxRuleIndex, type SyntaxRuleIndexStatus } from "./rule-index.js";
import type { ProductionRule, SyntaxProfile } from "./types.js";

export interface CatalogSyntaxExclusion {
  readonly entryId: string;
  readonly text: string;
  readonly status: Exclude<SyntaxRuleIndexStatus, "indexed">;
}

export interface CatalogSyntaxLegalityResult {
  readonly entries: readonly CatalogEntry[];
  readonly legalEntryIds: ReadonlySet<string>;
  readonly exclusions: readonly CatalogSyntaxExclusion[];
  readonly ruleIndex: SyntaxRuleIndex;
}

export type CatalogPackagingExclusionStatus =
  | Exclude<SyntaxRuleIndexStatus, "indexed">
  | "not-in-generation";

export interface CatalogSyntaxLegalityArtifact {
  readonly schemaVersion: "formal-syntax-catalog-legality-v1";
  readonly grammarVersion: string;
  readonly catalogEntryCount: number;
  readonly catalogDigest: string;
  readonly sourceSelectionDigest: string;
  readonly sourceEvidenceDigest: string;
  readonly sourceProfileProjectionDigest: string;
  readonly sourceRuleIndexDigest: string;
  readonly legalEntryCount: number;
  readonly exclusionCount: number;
  readonly legalEntryIds: readonly string[];
  readonly exclusions: readonly {
    readonly entryId: string;
    readonly text: string;
    readonly status: CatalogPackagingExclusionStatus;
  }[];
  readonly determinismDigest: string;
}

export function applyCatalogSyntaxLegalityArtifact(
  entries: readonly CatalogEntry[],
  artifact: CatalogSyntaxLegalityArtifact,
): {
  readonly entries: readonly CatalogEntry[];
  readonly legalEntryIds: ReadonlySet<string>;
  readonly exclusions: CatalogSyntaxLegalityArtifact["exclusions"];
} {
  const { determinismDigest, ...core } = artifact;
  if (artifact.schemaVersion !== "formal-syntax-catalog-legality-v1"
    || artifact.grammarVersion !== FORMAL_GRAMMAR_VERSION
    || artifact.catalogEntryCount !== entries.length
    || artifact.catalogDigest !== sha256Canonical(entries)
    || determinismDigest !== sha256Canonical(core)) {
    throw new Error("active catalog syntax legality artifact is stale or invalid");
  }
  const entryIds = new Set(entries.map((entry) => entry.id));
  const legalEntryIds = new Set(artifact.legalEntryIds);
  const excludedEntryIds = new Set(artifact.exclusions.map((item) => item.entryId));
  if (artifact.legalEntryIds.length !== artifact.legalEntryCount
    || artifact.exclusions.length !== artifact.exclusionCount
    || legalEntryIds.size !== artifact.legalEntryCount
    || excludedEntryIds.size !== artifact.exclusionCount
    || legalEntryIds.size + excludedEntryIds.size !== entries.length
    || [...legalEntryIds, ...excludedEntryIds].some((entryId) => !entryIds.has(entryId))
    || [...legalEntryIds].some((entryId) => excludedEntryIds.has(entryId))) {
    throw new Error("active catalog syntax legality identities are incomplete or duplicated");
  }
  return {
    entries: entries.filter((entry) => legalEntryIds.has(entry.id)),
    legalEntryIds,
    exclusions: artifact.exclusions,
  };
}

/** Product packaging gate: resolved catalog entries must also reach Sentence. */
export function filterCatalogBySyntaxLegality(input: {
  readonly entries: readonly CatalogEntry[];
  readonly profiles: readonly SyntaxProfile[];
  readonly rules?: readonly ProductionRule[];
}): CatalogSyntaxLegalityResult {
  const ruleIndex = buildSyntaxRuleIndex({
    lexemes: input.entries.map((entry, index) => ({
      id: entry.id,
      text: entry.prompt.text,
      generalRank: index + 1,
    })),
    profiles: input.profiles,
    rules: input.rules ?? FORMAL_SYNTAX_RULES,
  });
  const legalEntryIds = new Set(
    ruleIndex.entries
      .filter((entry) => entry.status === "indexed")
      .map((entry) => entry.entryId),
  );
  const entries = input.entries.filter((entry) => legalEntryIds.has(entry.id));
  const exclusions = ruleIndex.entries
    .filter((entry) => entry.status !== "indexed")
    .map((entry): CatalogSyntaxExclusion => ({
      entryId: entry.entryId,
      text: entry.text,
      status: entry.status as CatalogSyntaxExclusion["status"],
    }));
  if (entries.length + exclusions.length !== input.entries.length) {
    throw new Error("syntax legality gate lost catalog identities");
  }
  return { entries, legalEntryIds, exclusions, ruleIndex };
}

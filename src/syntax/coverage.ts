import type { CatalogEntry } from "../core/model.js";
import { sha256Canonical } from "../reference/importers/canonical-json.js";
import { FORMAL_GRAMMAR_VERSION } from "./features.js";
import { UPOS_VALUES } from "./types.js";
import type {
  DerivationBounds,
  ProductionFixture,
  ProductionRule,
  SyntaxProfile,
  Upos,
} from "./types.js";

export interface DerivationShapeCountRecord {
  readonly bounds: DerivationBounds;
  readonly count: number;
  readonly complete: boolean;
}

export interface SyntaxCoverageReport {
  readonly schemaVersion: "formal-syntax-coverage-v1";
  readonly grammarVersion: typeof FORMAL_GRAMMAR_VERSION;
  readonly uposCoverage: {
    readonly supported: readonly Upos[];
    readonly observedProfileCounts: Readonly<Record<string, number>>;
    readonly lexicalPositionCounts: Readonly<Record<string, number>>;
    readonly missingLexicalPositions: readonly Upos[];
  };
  readonly dependencyRelationCoverage: Readonly<Record<string, number>>;
  readonly productionRuleCoverage: {
    readonly ruleCount: number;
    readonly positiveFixtureCount: number;
    readonly negativeFixtureCount: number;
    readonly missingPositiveFixtureRuleIds: readonly string[];
    readonly missingNegativeFixtureRuleIds: readonly string[];
  };
  readonly constructionCoverage: Readonly<Record<string, number>>;
  readonly catalogEntrySyntaxCoverage: {
    readonly catalogEntryCount: number;
    readonly entryWithProfileCount: number;
    readonly noUdEvidenceEntryCount: number;
    readonly noUdEvidenceEntryIds: readonly string[];
  };
  readonly readingVariantCoverage: {
    readonly writtenFormWithMultipleReadingsCount: number;
    readonly readingVariantEntryCount: number;
    readonly fullyProfiledWrittenFormCount: number;
    readonly partiallyProfiledWrittenForms: readonly string[];
  };
  readonly unrealizableProfileCount: number;
  readonly unrealizableProfileIds: readonly string[];
  readonly derivationShapeCountByBound: readonly DerivationShapeCountRecord[];
  readonly determinismDigest: string;
}

export interface SyntaxCoverageInput {
  readonly entries: readonly CatalogEntry[];
  readonly profiles: readonly SyntaxProfile[];
  readonly rules: readonly ProductionRule[];
  readonly fixtures: readonly ProductionFixture[];
  readonly derivationShapeCountByBound?: readonly DerivationShapeCountRecord[];
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function increment(target: Record<string, number>, key: string, count = 1): void {
  target[key] = (target[key] ?? 0) + count;
}

function profileMatchesLexicalPosition(
  profile: SyntaxProfile,
  rule: ProductionRule,
): boolean {
  return rule.constituents.some((constituent) =>
    constituent.category === "Lexeme"
    && (constituent.allowedUpos.length === 0 || constituent.allowedUpos.includes(profile.upos))
    && constituent.requiredFunctions.every((value) => profile.functions.includes(value))
    && (constituent.requiredValencyFrames.length === 0
      || constituent.requiredValencyFrames.some((value) => profile.valencyFrames.includes(value))));
}

function validateShapeCounts(
  records: readonly DerivationShapeCountRecord[],
): readonly DerivationShapeCountRecord[] {
  return records.map((record) => {
    if (!Number.isInteger(record.count) || record.count < 0) {
      throw new Error("derivation shape counts must be non-negative integers");
    }
    for (const [key, value] of Object.entries(record.bounds)) {
      if (!Number.isInteger(value) || value <= 0) {
        throw new Error(`invalid derivation bound ${key}`);
      }
    }
    return record;
  });
}

export function buildSyntaxCoverageReport(
  input: SyntaxCoverageInput,
): SyntaxCoverageReport {
  const fixturesById = new Map(input.fixtures.map((fixture) => [fixture.id, fixture]));
  const observedProfileCounts: Record<string, number> = {};
  const lexicalPositionCounts: Record<string, number> = {};
  const dependencyRelationCoverage: Record<string, number> = {};
  const constructionCoverage: Record<string, number> = {};
  for (const upos of UPOS_VALUES) {
    observedProfileCounts[upos] = 0;
    lexicalPositionCounts[upos] = 0;
  }
  for (const profile of input.profiles) {
    increment(observedProfileCounts, profile.upos);
    for (const [relation, count] of Object.entries(
      profile.dependencyEvidence.dependencyRelationCounts,
    )) {
      increment(dependencyRelationCoverage, relation, count);
    }
  }
  for (const rule of input.rules) {
    increment(constructionCoverage, rule.id.split(".", 1)[0] ?? rule.id);
    for (const constituent of rule.constituents) {
      if (constituent.category !== "Lexeme") continue;
      for (const upos of constituent.allowedUpos) increment(lexicalPositionCounts, upos);
    }
  }
  const unrealizableProfileIds = input.profiles
    .filter((profile) => !input.rules.some((rule) => profileMatchesLexicalPosition(profile, rule)))
    .map((profile) => profile.id)
    .sort(compareText);
  const profileEntryIds = new Set(input.profiles.map((profile) => profile.entryId));
  const noUdEvidenceEntryIds = input.entries
    .filter((entry) => !profileEntryIds.has(entry.id))
    .map((entry) => entry.id)
    .sort(compareText);
  const byWrittenForm = new Map<string, CatalogEntry[]>();
  for (const entry of input.entries) {
    byWrittenForm.set(entry.prompt.text, [
      ...(byWrittenForm.get(entry.prompt.text) ?? []),
      entry,
    ]);
  }
  const variantGroups = [...byWrittenForm.entries()].filter(([, entries]) => entries.length > 1);
  const partiallyProfiledWrittenForms = variantGroups
    .filter(([, entries]) => {
      const covered = entries.filter((entry) => profileEntryIds.has(entry.id)).length;
      return covered > 0 && covered < entries.length;
    })
    .map(([text]) => text)
    .sort(compareText);
  const fullyProfiledWrittenFormCount = variantGroups.filter(([, entries]) =>
    entries.every((entry) => profileEntryIds.has(entry.id))).length;
  const missingPositiveFixtureRuleIds = input.rules
    .filter((rule) => rule.positiveFixtureIds.length === 0
      || rule.positiveFixtureIds.some((id) => fixturesById.get(id)?.expected !== "accept"))
    .map((rule) => rule.id)
    .sort(compareText);
  const missingNegativeFixtureRuleIds = input.rules
    .filter((rule) => rule.negativeFixtureIds.length === 0
      || rule.negativeFixtureIds.some((id) => fixturesById.get(id)?.expected !== "reject"))
    .map((rule) => rule.id)
    .sort(compareText);
  const core = {
    schemaVersion: "formal-syntax-coverage-v1" as const,
    grammarVersion: FORMAL_GRAMMAR_VERSION,
    uposCoverage: {
      supported: UPOS_VALUES,
      observedProfileCounts,
      lexicalPositionCounts,
      missingLexicalPositions: UPOS_VALUES.filter((upos) => lexicalPositionCounts[upos] === 0),
    },
    dependencyRelationCoverage: Object.fromEntries(
      Object.entries(dependencyRelationCoverage).sort(([left], [right]) => compareText(left, right)),
    ),
    productionRuleCoverage: {
      ruleCount: input.rules.length,
      positiveFixtureCount: input.fixtures.filter((fixture) => fixture.expected === "accept").length,
      negativeFixtureCount: input.fixtures.filter((fixture) => fixture.expected === "reject").length,
      missingPositiveFixtureRuleIds,
      missingNegativeFixtureRuleIds,
    },
    constructionCoverage: Object.fromEntries(
      Object.entries(constructionCoverage).sort(([left], [right]) => compareText(left, right)),
    ),
    catalogEntrySyntaxCoverage: {
      catalogEntryCount: input.entries.length,
      entryWithProfileCount: input.entries.length - noUdEvidenceEntryIds.length,
      noUdEvidenceEntryCount: noUdEvidenceEntryIds.length,
      noUdEvidenceEntryIds,
    },
    readingVariantCoverage: {
      writtenFormWithMultipleReadingsCount: variantGroups.length,
      readingVariantEntryCount: variantGroups.reduce((sum, [, entries]) => sum + entries.length, 0),
      fullyProfiledWrittenFormCount,
      partiallyProfiledWrittenForms,
    },
    unrealizableProfileCount: unrealizableProfileIds.length,
    unrealizableProfileIds,
    derivationShapeCountByBound: validateShapeCounts(input.derivationShapeCountByBound ?? []),
  };
  return {
    ...core,
    determinismDigest: sha256Canonical(core),
  };
}

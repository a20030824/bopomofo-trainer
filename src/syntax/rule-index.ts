import { sha256Canonical } from "../reference/importers/canonical-json.js";
import { FORMAL_GRAMMAR_VERSION } from "./features.js";
import { syntaxProfileMatchesRequirements, unsupportedProfileFeatureNames } from "./profile-match.js";
import type {
  ProductionConstituent,
  ProductionRule,
  SyntaxCategory,
  SyntaxProfile,
  Upos,
} from "./types.js";

export interface RankedSyntaxLexeme {
  readonly id: string;
  readonly text: string;
  readonly generalRank: number;
}

export type SyntaxRuleIndexStatus =
  | "indexed"
  | "no-ud-evidence"
  | "no-compatible-rule-position"
  | "no-reachable-sentence-rule";

export interface SyntaxRuleIndexEntry {
  readonly generalRank: number;
  readonly entryId: string;
  readonly text: string;
  readonly status: SyntaxRuleIndexStatus;
  readonly profileIds: readonly string[];
  readonly upos: readonly Upos[];
  readonly directPositionIds: readonly string[];
  readonly reachableRuleIds: readonly string[];
  readonly sentenceRuleIds: readonly string[];
}

export interface SyntaxRuleReachabilityEntry {
  readonly ruleId: string;
  readonly output: SyntaxCategory;
  readonly globallyRealizable: boolean;
  readonly blockerConstituentKeys: readonly string[];
  readonly unsupportedFeatureNames: readonly string[];
  readonly directCandidateCount: number;
  readonly reachableCandidateCount: number;
}

export interface SyntaxRuleIndex {
  readonly schemaVersion: "formal-syntax-rule-index-v1";
  readonly grammarVersion: typeof FORMAL_GRAMMAR_VERSION;
  readonly candidateCount: number;
  readonly profileCount: number;
  readonly indexedCandidateCount: number;
  readonly noUdEvidenceCandidateCount: number;
  readonly noCompatibleRulePositionCandidateCount: number;
  readonly noReachableSentenceRuleCandidateCount: number;
  readonly globallyRealizableRuleCount: number;
  readonly entries: readonly SyntaxRuleIndexEntry[];
  readonly rules: readonly SyntaxRuleReachabilityEntry[];
  readonly determinismDigest: string;
}

const EMPTY_REQUIREMENTS = {
  allowedUpos: [],
  requiredFunctions: [],
  requiredValencyFrames: [],
  requiredFeatures: {},
} as const;

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function addAll(target: Set<string>, values: Iterable<string>): boolean {
  let changed = false;
  for (const value of values) {
    if (target.has(value)) continue;
    target.add(value);
    changed = true;
  }
  return changed;
}

function requirementsFor(constituent: ProductionConstituent) {
  return {
    allowedUpos: constituent.allowedUpos,
    requiredFunctions: constituent.requiredFunctions,
    requiredValencyFrames: constituent.requiredValencyFrames,
    requiredFeatures: constituent.requiredFeatures,
  };
}

function isSyntheticPunctuation(constituent: ProductionConstituent): boolean {
  return constituent.category === "Lexeme"
    && constituent.allowedUpos.length === 1
    && constituent.allowedUpos[0] === "PUNCT";
}

/**
 * The v1 rule schema predates an explicit head field.  These structural keys
 * are the grammar's head-bearing conventions; the final fallback keeps custom
 * test/extension rules useful without guessing from lexical text.
 */
export function productionHeadConstituentKeys(
  rule: ProductionRule,
): readonly string[] {
  const keys = new Set(rule.constituents.map((item) => item.key));
  const present = (candidates: readonly string[]) => candidates.filter((key) => keys.has(key));
  const exactHead = present(["head"]);
  if (exactHead.length > 0) return exactHead;
  switch (rule.output) {
    case "Sentence":
      return present(["clause", "sequence"]);
    case "Clause":
      return present([
        "predicate", "comment", "firstPredicate", "secondPredicate", "resultPredicate",
        "secondaryPredicate", "copula",
      ]);
    case "ClauseSequence":
      return present(["firstClause", "secondClause", "clause"]);
    case "Complement":
      return present(["result", "direction", "degree", "quantity", "duration"]);
    case "ContentClause":
    case "RelativeClause":
    case "QuotedClause":
      return present(["clause"]);
    case "NumeralPhrase":
      return present(["number"]);
    default: {
      const recursiveHeads = present(["left", "right"]);
      if (recursiveHeads.length > 0) return recursiveHeads;
      const required = rule.constituents.filter((item) => item.minimum > 0);
      return required[0] === undefined ? [] : [required[0].key];
    }
  }
}

function profilesMatching(
  profiles: readonly SyntaxProfile[],
  constituent: ProductionConstituent,
): readonly SyntaxProfile[] {
  return profiles.filter((profile) =>
    syntaxProfileMatchesRequirements(profile, requirementsFor(constituent))
  );
}

function constituentUnsupportedFeatures(
  constituent: ProductionConstituent,
): readonly string[] {
  return unsupportedProfileFeatureNames(constituent.requiredFeatures);
}

function evidenceBackedRequirements(constituent: ProductionConstituent) {
  const unsupported = new Set(constituentUnsupportedFeatures(constituent));
  return {
    ...requirementsFor(constituent),
    requiredFeatures: Object.fromEntries(
      Object.entries(constituent.requiredFeatures)
        .filter(([feature]) => !unsupported.has(feature)),
    ),
  };
}

export function buildSyntaxRuleIndex(input: {
  readonly lexemes: readonly RankedSyntaxLexeme[];
  readonly profiles: readonly SyntaxProfile[];
  readonly rules: readonly ProductionRule[];
}): SyntaxRuleIndex {
  const lexemes = [...input.lexemes].sort((left, right) =>
    left.generalRank - right.generalRank || compareText(left.id, right.id)
  );
  const rules = [...input.rules].sort((left, right) => compareText(left.id, right.id));
  const profiles = [...input.profiles].sort((left, right) => compareText(left.id, right.id));
  const lexemeIds = new Set(lexemes.map((item) => item.id));
  if (lexemeIds.size !== lexemes.length) throw new Error("syntax rule index requires unique lexeme IDs");
  if (lexemes.some((item) => !item.text || !Number.isInteger(item.generalRank) || item.generalRank <= 0)) {
    throw new Error("syntax rule index requires non-empty text and positive integer ranks");
  }
  if (profiles.some((profile) => !lexemeIds.has(profile.entryId))) {
    throw new Error("syntax rule index profile references an unknown lexeme");
  }

  const profilesByEntry = new Map<string, SyntaxProfile[]>();
  for (const profile of profiles) {
    const values = profilesByEntry.get(profile.entryId) ?? [];
    values.push(profile);
    profilesByEntry.set(profile.entryId, values);
  }

  const directPositionsByEntry = new Map<string, Set<string>>();
  const directEntriesByRule = new Map<string, Set<string>>();
  for (const rule of rules) {
    const directEntries = new Set<string>();
    for (const constituent of rule.constituents) {
      if (constituent.category !== "Lexeme" || isSyntheticPunctuation(constituent)) continue;
      const positionId = `${rule.id}:${constituent.key}`;
      for (const profile of profilesMatching(profiles, constituent)) {
        const positions = directPositionsByEntry.get(profile.entryId) ?? new Set<string>();
        positions.add(positionId);
        directPositionsByEntry.set(profile.entryId, positions);
        directEntries.add(profile.entryId);
      }
    }
    directEntriesByRule.set(rule.id, directEntries);
  }

  const availableCategories = new Set<SyntaxCategory>();
  const headProfileIdsByCategory = new Map<SyntaxCategory, Set<string>>();
  const participantEntryIdsByCategory = new Map<SyntaxCategory, Set<string>>();
  const realizableRuleIds = new Set<string>();
  const participantEntryIdsByRule = new Map<string, Set<string>>();
  const profilesById = new Map(profiles.map((profile) => [profile.id, profile]));

  const candidateProfilesForConstituent = (constituent: ProductionConstituent): readonly SyntaxProfile[] => {
    if (constituent.category === "Lexeme") return profilesMatching(profiles, constituent);
    return [...(headProfileIdsByCategory.get(constituent.category) ?? [])]
      .map((id) => profilesById.get(id))
      .filter((profile): profile is SyntaxProfile => profile !== undefined)
      .filter((profile) => syntaxProfileMatchesRequirements(profile, {
        ...EMPTY_REQUIREMENTS,
        ...evidenceBackedRequirements(constituent),
      }));
  };

  const constituentAvailable = (constituent: ProductionConstituent): boolean => {
    if (constituent.minimum === 0) return true;
    if (isSyntheticPunctuation(constituent)) return true;
    if (constituent.category === "Lexeme"
      && constituentUnsupportedFeatures(constituent).length > 0) return false;
    if (constituent.category === "Lexeme") {
      return candidateProfilesForConstituent(constituent).length > 0;
    }
    return availableCategories.has(constituent.category)
      && candidateProfilesForConstituent(constituent).length > 0;
  };

  let changed = true;
  while (changed) {
    changed = false;
    for (const rule of rules) {
      if (!rule.constituents.every(constituentAvailable)) continue;
      if (!realizableRuleIds.has(rule.id)) {
        realizableRuleIds.add(rule.id);
        availableCategories.add(rule.output);
        changed = true;
      }
      const participants = participantEntryIdsByRule.get(rule.id) ?? new Set<string>();
      for (const constituent of rule.constituents) {
        if (constituent.category === "Lexeme") {
          if (!isSyntheticPunctuation(constituent)) {
            changed = addAll(
              participants,
              candidateProfilesForConstituent(constituent).map((profile) => profile.entryId),
            ) || changed;
          }
        } else if (constituentAvailable(constituent)) {
          changed = addAll(
            participants,
            participantEntryIdsByCategory.get(constituent.category) ?? [],
          ) || changed;
        }
      }
      participantEntryIdsByRule.set(rule.id, participants);
      const categoryParticipants = participantEntryIdsByCategory.get(rule.output) ?? new Set<string>();
      changed = addAll(categoryParticipants, participants) || changed;
      participantEntryIdsByCategory.set(rule.output, categoryParticipants);

      const headProfiles = headProfileIdsByCategory.get(rule.output) ?? new Set<string>();
      const headKeys = new Set(productionHeadConstituentKeys(rule));
      for (const constituent of rule.constituents) {
        if (!headKeys.has(constituent.key)) continue;
        changed = addAll(
          headProfiles,
          candidateProfilesForConstituent(constituent).map((profile) => profile.id),
        ) || changed;
      }
      headProfileIdsByCategory.set(rule.output, headProfiles);
    }
  }

  const reachableRuleIdsByEntry = new Map<string, Set<string>>();
  for (const [ruleId, entryIds] of participantEntryIdsByRule) {
    if (!realizableRuleIds.has(ruleId)) continue;
    for (const entryId of entryIds) {
      const ids = reachableRuleIdsByEntry.get(entryId) ?? new Set<string>();
      ids.add(ruleId);
      reachableRuleIdsByEntry.set(entryId, ids);
    }
  }
  const rulesById = new Map(rules.map((rule) => [rule.id, rule]));
  const entries: SyntaxRuleIndexEntry[] = lexemes.map((lexeme) => {
    const entryProfiles = profilesByEntry.get(lexeme.id) ?? [];
    const directPositionIds = [...(directPositionsByEntry.get(lexeme.id) ?? [])].sort(compareText);
    const reachableRuleIds = [...(reachableRuleIdsByEntry.get(lexeme.id) ?? [])].sort(compareText);
    const sentenceRuleIds = reachableRuleIds
      .filter((id) => rulesById.get(id)?.output === "Sentence")
      .sort(compareText);
    const status: SyntaxRuleIndexStatus = entryProfiles.length === 0
      ? "no-ud-evidence"
      : directPositionIds.length === 0
        ? "no-compatible-rule-position"
        : sentenceRuleIds.length === 0
          ? "no-reachable-sentence-rule"
          : "indexed";
    return {
      generalRank: lexeme.generalRank,
      entryId: lexeme.id,
      text: lexeme.text,
      status,
      profileIds: entryProfiles.map((profile) => profile.id).sort(compareText),
      upos: [...new Set(entryProfiles.map((profile) => profile.upos))].sort(compareText),
      directPositionIds,
      reachableRuleIds,
      sentenceRuleIds,
    };
  });

  const ruleEntries: SyntaxRuleReachabilityEntry[] = rules.map((rule) => {
    const blockerConstituentKeys = rule.constituents
      .filter((constituent) => !constituentAvailable(constituent))
      .map((constituent) => constituent.key)
      .sort(compareText);
    const unsupportedFeatureNames = [...new Set(
      rule.constituents.flatMap(constituentUnsupportedFeatures),
    )].sort(compareText);
    return {
      ruleId: rule.id,
      output: rule.output,
      globallyRealizable: realizableRuleIds.has(rule.id),
      blockerConstituentKeys,
      unsupportedFeatureNames,
      directCandidateCount: directEntriesByRule.get(rule.id)?.size ?? 0,
      reachableCandidateCount: participantEntryIdsByRule.get(rule.id)?.size ?? 0,
    };
  });
  const core = {
    schemaVersion: "formal-syntax-rule-index-v1" as const,
    grammarVersion: FORMAL_GRAMMAR_VERSION,
    candidateCount: entries.length,
    profileCount: profiles.length,
    indexedCandidateCount: entries.filter((item) => item.status === "indexed").length,
    noUdEvidenceCandidateCount: entries.filter((item) => item.status === "no-ud-evidence").length,
    noCompatibleRulePositionCandidateCount: entries
      .filter((item) => item.status === "no-compatible-rule-position").length,
    noReachableSentenceRuleCandidateCount: entries
      .filter((item) => item.status === "no-reachable-sentence-rule").length,
    globallyRealizableRuleCount: ruleEntries.filter((item) => item.globallyRealizable).length,
    entries,
    rules: ruleEntries,
  };
  return { ...core, determinismDigest: sha256Canonical(core) };
}

import type { CatalogEntry, RandomSource } from "../core/model.js";
import type {
  GrammarCompositionResult,
  GrammarUtteranceCandidate,
} from "../grammar/types.js";
import { FORMAL_SYNTAX_RULES } from "../syntax/grammar.js";
import {
  buildLexicalProfileIndex,
  compatibleProfilesForSlot,
  realizeStructuralDerivation,
} from "../syntax/realize.js";
import { sampleStructuralDerivation } from "../syntax/sample.js";
import type {
  DerivationBounds,
  ProductionRule,
  RuntimeSyntaxProfile,
} from "../syntax/types.js";

export interface FormalSyntaxUtteranceInput {
  readonly eligibleEntries: readonly CatalogEntry[];
  readonly profiles: readonly RuntimeSyntaxProfile[];
  readonly random: RandomSource;
  readonly entryWeightsById?: Readonly<Record<string, number>>;
  readonly maximumCandidates: number;
  readonly maximumAttempts: number;
  readonly rules?: readonly ProductionRule[];
  readonly bounds?: DerivationBounds;
}

function nextUnit(random: RandomSource): number {
  const value = random.next();
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new Error("RandomSource.next() must return a finite value in [0, 1)");
  }
  return value;
}

function defaultEntryWeight(entry: CatalogEntry): number {
  return entry.commonnessBase?.selectionWeight ?? 1 / entry.frequencyBand;
}

function weightedIndex(
  weights: readonly number[],
  random: RandomSource,
): number | null {
  if (weights.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new Error("formal syntax entry weights must be finite and non-negative");
  }
  const total = weights.reduce((sum, value) => sum + value, 0);
  if (!(total > 0)) return null;
  let target = nextUnit(random) * total;
  for (let index = 0; index < weights.length; index += 1) {
    target -= weights[index] ?? 0;
    if (target < 0) return index;
  }
  return weights.length - 1;
}

function selectCompatibleProfile(
  compatible: readonly RuntimeSyntaxProfile[],
  usedEntryIds: ReadonlySet<string>,
  entriesById: ReadonlyMap<string, CatalogEntry>,
  entryWeightsById: Readonly<Record<string, number>> | undefined,
  random: RandomSource,
): RuntimeSyntaxProfile | null {
  const profilesByEntryId = new Map<string, RuntimeSyntaxProfile[]>();
  for (const profile of compatible) {
    if (usedEntryIds.has(profile.entryId)) continue;
    const profiles = profilesByEntryId.get(profile.entryId) ?? [];
    profiles.push(profile);
    profilesByEntryId.set(profile.entryId, profiles);
  }
  const entryIds = [...profilesByEntryId.keys()];
  const selectedEntryIndex = weightedIndex(entryIds.map((entryId) => {
    const entry = entriesById.get(entryId);
    if (entry === undefined) throw new Error(`formal syntax profile references missing entry ${entryId}`);
    return entryWeightsById?.[entry.id] ?? defaultEntryWeight(entry);
  }), random);
  if (selectedEntryIndex === null) return null;
  const selectedEntryId = entryIds[selectedEntryIndex];
  if (selectedEntryId === undefined) throw new Error("formal syntax entry selection failed");
  const entryProfiles = profilesByEntryId.get(selectedEntryId) ?? [];
  if (entryProfiles.length === 0) throw new Error("formal syntax profile group is empty");
  const selectedProfileIndex = entryProfiles.length === 1
    ? 0
    : Math.floor(nextUnit(random) * entryProfiles.length);
  return entryProfiles[selectedProfileIndex] ?? null;
}

function punctuationForPath(path: readonly string[]): "。" | "！" | "？" {
  if (path.some((id) => id.includes("question"))) return "？";
  if (path.some((id) => id === "sentence.exclamative")) return "！";
  return "。";
}

export function composeFormalSyntaxUtterances(
  input: FormalSyntaxUtteranceInput,
): GrammarCompositionResult {
  if (!Number.isInteger(input.maximumCandidates) || input.maximumCandidates <= 0) {
    throw new Error("maximumCandidates must be a positive integer");
  }
  if (!Number.isInteger(input.maximumAttempts) || input.maximumAttempts <= 0) {
    throw new Error("maximumAttempts must be a positive integer");
  }
  const eligibleEntryIds = new Set(input.eligibleEntries.map((entry) => entry.id));
  const eligibleProfiles = input.profiles.filter((profile) => eligibleEntryIds.has(profile.entryId));
  const index = buildLexicalProfileIndex(input.eligibleEntries, eligibleProfiles);
  const entriesById = new Map(input.eligibleEntries.map((entry) => [entry.id, entry]));
  const rules = input.rules ?? FORMAL_SYNTAX_RULES;
  const candidates = new Map<string, GrammarUtteranceCandidate>();
  const fallbackReasons = new Set<string>();

  for (let attempt = 0;
    attempt < input.maximumAttempts && candidates.size < input.maximumCandidates;
    attempt += 1) {
    const shape = sampleStructuralDerivation({
      rootCategory: "Sentence",
      rules,
      random: input.random,
      maximumAttempts: 1,
      ...(input.bounds === undefined ? {} : { bounds: input.bounds }),
    });
    if (shape === null) {
      fallbackReasons.add("formal-syntax-structural-sampling-exhausted");
      continue;
    }
    const offsets: Record<string, number> = {};
    const usedEntryIds = new Set<string>();
    let unrealizable = false;
    for (const slot of shape.lexicalSlots) {
      if (slot.allowedUpos.length === 1 && slot.allowedUpos[0] === "PUNCT") continue;
      const compatible = compatibleProfilesForSlot(slot, index);
      const selectedProfile = selectCompatibleProfile(
        compatible,
        usedEntryIds,
        entriesById,
        input.entryWeightsById,
        input.random,
      );
      if (selectedProfile === null) {
        unrealizable = true;
        break;
      }
      const selectedIndex = compatible.findIndex((profile) => profile.id === selectedProfile.id);
      if (selectedIndex < 0) throw new Error("formal syntax compatible profile selection failed");
      offsets[slot.id] = selectedIndex;
      usedEntryIds.add(selectedProfile.entryId);
    }
    if (unrealizable) {
      fallbackReasons.add("formal-syntax-unrealizable-shape");
      continue;
    }
    const punctuation = punctuationForPath(shape.productionRulePath);
    const realization = realizeStructuralDerivation(shape, {
      entries: input.eligibleEntries,
      profiles: eligibleProfiles,
      profileOffsetsBySlotId: offsets,
      punctuationToken: punctuation,
    });
    if (realization === null) {
      fallbackReasons.add("formal-syntax-realization-failed");
      continue;
    }
    const entries = realization.entryIds.map((entryId) => {
      const entry = entriesById.get(entryId);
      if (entry === undefined) throw new Error(`formal syntax selected missing entry ${entryId}`);
      return entry;
    });
    const text = realization.tokens
      .filter((token) => token.kind === "lexical-entry")
      .map((token) => token.value)
      .join("");
    const hasPunctuation = realization.tokens.some((token) => token.kind === "punctuation");
    candidates.set(realization.id, {
      id: realization.id,
      kind: "formal-syntax",
      templateId: null,
      entries,
      assignments: [],
      text,
      punctuation: hasPunctuation ? punctuation : null,
      syntaxDerivationId: realization.derivationId,
      syntaxProfileIds: realization.syntaxProfileIds,
    });
  }

  if (candidates.size === 0) fallbackReasons.add("formal-syntax-no-candidate");
  return {
    candidates: [...candidates.values()],
    fallbackReasons: [...fallbackReasons].sort(),
  };
}

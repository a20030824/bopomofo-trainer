import type { CatalogEntry, RandomSource, TokenId } from "../core/model.js";
import { weightedPick } from "./random.js";
import { entryTokenSet } from "./support.js";
import type {
  BuiltCurriculumExercise,
  CatalogSupportIndex,
  CurriculumEvidence,
  CurriculumPolicy,
  CurriculumProfile,
  ExerciseCandidateWeight,
  ExercisePickTrace,
} from "./types.js";

function codeUnitCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function candidateWeight(
  entry: CatalogEntry,
  focusEntryIds: ReadonlySet<string>,
  profile: CurriculumProfile,
  policy: CurriculumPolicy,
): ExerciseCandidateWeight {
  const tokens = entryTokenSet(entry);
  const containsFocus = focusEntryIds.has(entry.id);
  const frequencyWeight = policy.frequencyBandWeights[entry.frequencyBand];
  const focusWeight = containsFocus ? policy.focusedEntryBoost : 1;
  const recentEntryWeight = profile.recentEntryIds.includes(entry.id)
    ? policy.recentEntryPenalty
    : 1;
  const overlap = profile.recentTokenIds.reduce(
    (count, tokenId) => count + (tokens.has(tokenId) ? 1 : 0),
    0,
  );
  const recentTokenWeight = Math.pow(policy.recentTokenPenalty, overlap);
  return {
    entryId: entry.id,
    containsFocus,
    frequencyWeight,
    focusWeight,
    recentEntryWeight,
    recentTokenWeight,
    totalWeight: frequencyWeight
      * focusWeight
      * recentEntryWeight
      * recentTokenWeight,
  };
}

function pickOne(
  entries: readonly CatalogEntry[],
  focusEntryIds: ReadonlySet<string>,
  profile: CurriculumProfile,
  policy: CurriculumPolicy,
  random: RandomSource,
  position: number,
  pool: "focused" | "general",
): { readonly entry: CatalogEntry; readonly trace: ExercisePickTrace } {
  const weights = entries.map((entry) =>
    candidateWeight(entry, focusEntryIds, profile, policy),
  );
  const selectedId = weightedPick(
    weights.map((weight) => ({ value: weight.entryId, weight: weight.totalWeight })),
    random,
  );
  const entry = entries.find((candidate) => candidate.id === selectedId)!;
  return {
    entry,
    trace: {
      position,
      pool,
      candidates: [...weights].sort((left, right) =>
        codeUnitCompare(left.entryId, right.entryId),
      ),
      selectedEntryId: selectedId,
    },
  };
}

export function buildCurriculumExercise(
  support: CatalogSupportIndex,
  profile: CurriculumProfile,
  focusTokenId: TokenId | null,
  focusEvidence: CurriculumEvidence | null,
  policy: CurriculumPolicy,
  random: RandomSource,
): BuiltCurriculumExercise {
  const allEntries = Object.values(support.entriesById)
    .sort((left, right) => codeUnitCompare(left.id, right.id));
  if (allEntries.length === 0) {
    throw new Error("cannot build an exercise from an empty catalog");
  }

  const fallbackReasons: string[] = [];
  const tokenSupport = focusTokenId === null ? undefined : support.byToken[focusTokenId];
  const focusEntryIds = focusTokenId === null || tokenSupport === undefined
    ? []
    : focusEvidence === "timed"
      ? tokenSupport.motorEntryIds
      : tokenSupport.bindingEntryIds;
  const focusEntrySet = new Set(focusEntryIds);
  const focusEntries = focusEntryIds.map((entryId) => support.entriesById[entryId]!);
  const desiredFocused = focusTokenId === null
    ? 0
    : Math.ceil(policy.exerciseEntryCount * policy.focusedEntryShare);
  const focusedCount = Math.min(
    desiredFocused,
    focusEntries.length,
    policy.exerciseEntryCount,
  );
  if (focusTokenId !== null && focusEntries.length < desiredFocused) {
    fallbackReasons.push(`focus-support-limited:${focusEntries.length}/${desiredFocused}`);
  }

  const selected: CatalogEntry[] = [];
  const picks: ExercisePickTrace[] = [];
  const selectFromPool = (
    poolEntries: readonly CatalogEntry[],
    pool: "focused" | "general",
  ): void => {
    const available = poolEntries.filter(
      (entry) => !selected.some((chosen) => chosen.id === entry.id),
    );
    const source = available.length > 0 ? available : poolEntries;
    if (source.length === 0) return;
    const picked = pickOne(
      source,
      focusEntrySet,
      profile,
      policy,
      random,
      selected.length,
      pool,
    );
    selected.push(picked.entry);
    picks.push(picked.trace);
  };

  for (let index = 0; index < focusedCount; index += 1) {
    selectFromPool(focusEntries, "focused");
  }
  while (selected.length < Math.min(policy.exerciseEntryCount, allEntries.length)) {
    selectFromPool(allEntries, "general");
  }

  return {
    exercise: {
      id: `curriculum-round-${profile.round}`,
      mode: profile.mode,
      layoutId: profile.layoutId,
      entries: selected,
    },
    focusTokenId,
    focusEvidence,
    picks,
    fallbackReasons,
  };
}

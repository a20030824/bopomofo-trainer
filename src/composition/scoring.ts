import type { RelationOccurrence } from "../relations/types.js";
import type { ObjectiveTarget } from "./objective.js";
import type {
  CandidateRejectionReason,
  CandidateScore,
  CompositionInput,
  CompositionStrategyId,
  PracticeBudget,
  RetrievalCandidate,
  SelectionReason,
  TargetEvidence,
} from "./types.js";
import { compareText } from "./stable.js";

export interface CompositionState {
  readonly selected: readonly RetrievalCandidate[];
  readonly selectedEvidence: readonly (readonly TargetEvidence[])[];
  readonly exposureByTarget: ReadonlyMap<string, number>;
  readonly exposureByTargetAndEntry: ReadonlyMap<string, ReadonlyMap<string, number>>;
  readonly entryUses: ReadonlyMap<string, number>;
  readonly pathUses: ReadonlyMap<string, number>;
  readonly tokens: number;
  readonly syllables: number;
  readonly commonEntries: number;
}

export interface ScoredCandidate {
  readonly candidate: RetrievalCandidate;
  readonly selectedEvidence: readonly TargetEvidence[];
  readonly score: CandidateScore;
  readonly weightedMarginalGain: number;
}

export function emptyCompositionState(): CompositionState {
  return {
    selected: [],
    selectedEvidence: [],
    exposureByTarget: new Map(),
    exposureByTargetAndEntry: new Map(),
    entryUses: new Map(),
    pathUses: new Map(),
    tokens: 0,
    syllables: 0,
    commonEntries: 0,
  };
}

function trimOccurrences(
  occurrences: readonly RelationOccurrence[],
  limit: number,
): readonly RelationOccurrence[] {
  return occurrences.slice(0, limit);
}

export function evidenceWithinMaximum(
  candidate: RetrievalCandidate,
  state: CompositionState,
  targets: readonly ObjectiveTarget[],
): readonly TargetEvidence[] {
  const targetMap = new Map(targets.map((target) => [target.key, target]));
  const evidence: TargetEvidence[] = [];
  for (const item of candidate.targetEvidence) {
    const target = targetMap.get(item.targetKey);
    if (target === undefined) continue;
    const current = state.exposureByTarget.get(item.targetKey) ?? 0;
    const remaining = Math.max(0, target.exposures.maximum - current);
    if (remaining === 0) continue;
    const exactOccurrences = trimOccurrences(item.exactOccurrences, remaining);
    const contrastRemaining = Math.max(0, remaining - exactOccurrences.length);
    const contrastRequirements = item.contrastRequirements.slice(0, contrastRemaining);
    const exposureCount = exactOccurrences.length + contrastRequirements.length;
    if (exposureCount === 0) continue;
    evidence.push({
      targetKey: item.targetKey,
      relation: item.relation,
      exactOccurrences,
      contrastRequirements,
      exposureCount,
    });
  }
  return evidence;
}

function totalExposure(evidence: readonly TargetEvidence[]): number {
  return evidence.reduce((sum, item) => sum + item.exposureCount, 0);
}

function weightedExposure(
  evidence: readonly TargetEvidence[],
  targets: readonly ObjectiveTarget[],
): number {
  const weights = new Map(targets.map((target) => [target.key, target.weight]));
  return evidence.reduce(
    (sum, item) => sum + item.exposureCount * (weights.get(item.targetKey) ?? 0),
    0,
  );
}

function countMatches(values: readonly string[], target: string): number {
  return values.reduce((sum, value) => sum + (value === target ? 1 : 0), 0);
}

function predictedConcentration(
  state: CompositionState,
  candidate: RetrievalCandidate,
  evidence: readonly TargetEvidence[],
): number {
  let maximum = 0;
  for (const item of evidence) {
    const currentTotal = state.exposureByTarget.get(item.targetKey) ?? 0;
    const currentByEntry = state.exposureByTargetAndEntry.get(item.targetKey) ?? new Map();
    const candidateEntryExposure = (currentByEntry.get(candidate.entry.id) ?? 0) + item.exposureCount;
    let largest = candidateEntryExposure;
    for (const [entryId, exposure] of currentByEntry) {
      if (entryId !== candidate.entry.id) largest = Math.max(largest, exposure);
    }
    maximum = Math.max(maximum, largest / (currentTotal + item.exposureCount));
  }
  return maximum;
}

interface FutureExposureCopy {
  readonly entryId: string;
  readonly tokens: number;
  readonly syllables: number;
  readonly exposure: number;
}

interface FutureExposureState {
  readonly tokens: number;
  readonly syllables: number;
  readonly boundaries: number;
  readonly exposure: number;
}

function futureStateKey(state: FutureExposureState): string {
  return `${state.tokens}:${state.syllables}:${state.boundaries}`;
}

function maximumBudgetedFutureExposureFromOtherEntries(
  target: ObjectiveTarget,
  excludedEntryId: string,
  predicted: CompositionState,
  candidates: readonly RetrievalCandidate[],
  budget: PracticeBudget,
): number {
  const currentExposure = predicted.exposureByTarget.get(target.key) ?? 0;
  const maximumAdditional = Math.max(0, target.exposures.maximum - currentExposure);
  if (maximumAdditional === 0) return 0;

  const remainingTokens = budget.maximumTokens - predicted.tokens;
  const remainingSyllables = budget.maximumSyllables - predicted.syllables;
  const remainingBoundaries = budget.maximumLexicalBoundaries
    - Math.max(0, predicted.selected.length - 1);
  if (remainingTokens < 0 || remainingSyllables < 0 || remainingBoundaries <= 0) return 0;

  const copies: FutureExposureCopy[] = [];
  for (const future of candidates) {
    if (future.entry.id === excludedEntryId) continue;
    const perUse = future.targetEvidence
      .find((item) => item.targetKey === target.key)?.exposureCount ?? 0;
    if (perUse <= 0) continue;
    const available = Math.max(
      0,
      budget.maximumSameEntryRepetition - (predicted.entryUses.get(future.entry.id) ?? 0),
    );
    for (let use = 0; use < available; use += 1) {
      copies.push({
        entryId: future.entry.id,
        tokens: future.tokenCount,
        syllables: future.syllableCount,
        exposure: perUse,
      });
    }
  }
  copies.sort((left, right) => compareText(left.entryId, right.entryId)
    || left.tokens - right.tokens
    || left.syllables - right.syllables
    || right.exposure - left.exposure);

  let states = new Map<string, FutureExposureState>();
  const empty: FutureExposureState = { tokens: 0, syllables: 0, boundaries: 0, exposure: 0 };
  states.set(futureStateKey(empty), empty);
  for (const copy of copies) {
    const next = new Map(states);
    for (const state of states.values()) {
      const candidateState: FutureExposureState = {
        tokens: state.tokens + copy.tokens,
        syllables: state.syllables + copy.syllables,
        boundaries: state.boundaries + 1,
        exposure: Math.min(maximumAdditional, state.exposure + copy.exposure),
      };
      if (candidateState.tokens > remainingTokens
        || candidateState.syllables > remainingSyllables
        || candidateState.boundaries > remainingBoundaries) continue;
      const key = futureStateKey(candidateState);
      const existing = next.get(key);
      if (existing === undefined || candidateState.exposure > existing.exposure) {
        next.set(key, candidateState);
      }
    }
    states = next;
  }

  let maximum = 0;
  for (const state of states.values()) maximum = Math.max(maximum, state.exposure);
  return maximum;
}

function largestEntryExposure(
  byEntry: ReadonlyMap<string, number>,
): { readonly entryId: string; readonly exposure: number } | null {
  let largest: { entryId: string; exposure: number } | null = null;
  for (const [entryId, exposure] of byEntry) {
    if (largest === null
      || exposure > largest.exposure
      || (exposure === largest.exposure && compareText(entryId, largest.entryId) < 0)) {
      largest = { entryId, exposure };
    }
  }
  return largest;
}

function concentrationRecoverable(
  state: CompositionState,
  candidate: RetrievalCandidate,
  evidence: readonly TargetEvidence[],
  targets: readonly ObjectiveTarget[],
  candidates: readonly RetrievalCandidate[],
  budget: PracticeBudget,
): boolean {
  const targetMap = new Map(targets.map((target) => [target.key, target]));
  const predicted = applyCandidate(state, candidate, evidence);
  for (const item of evidence) {
    const target = targetMap.get(item.targetKey)!;
    const nextTotal = predicted.exposureByTarget.get(item.targetKey) ?? 0;
    const nextByEntry = predicted.exposureByTargetAndEntry.get(item.targetKey) ?? new Map();
    const largest = largestEntryExposure(nextByEntry);
    if (largest === null || largest.exposure / nextTotal <= budget.maximumRelationConcentration) {
      continue;
    }
    const additionalNeeded = Math.ceil(
      largest.exposure / budget.maximumRelationConcentration - nextTotal,
    );
    const maximumAdditional = maximumBudgetedFutureExposureFromOtherEntries(
      target,
      largest.entryId,
      predicted,
      candidates,
      budget,
    );
    if (maximumAdditional < additionalNeeded) return false;
  }
  return true;
}

function commonEntriesNeeded(commonEntries: number, selectedEntries: number, share: number): number {
  if (share <= 0 || commonEntries / Math.max(1, selectedEntries) >= share) return 0;
  if (share === 1) return Number.POSITIVE_INFINITY;
  return Math.max(0, Math.ceil((share * selectedEntries - commonEntries) / (1 - share)));
}

function commonShareRecoverable(
  state: CompositionState,
  candidate: RetrievalCandidate,
  selectedEvidence: readonly TargetEvidence[],
  targets: readonly ObjectiveTarget[],
  candidates: readonly RetrievalCandidate[],
  budget: PracticeBudget,
): boolean {
  const nextSelected = state.selected.length + 1;
  const nextCommon = state.commonEntries + (candidate.commonWord ? 1 : 0);
  const needed = commonEntriesNeeded(nextCommon, nextSelected, budget.minimumCommonWordShare);
  if (needed === 0) return true;

  let predicted = applyCandidate(state, candidate, selectedEvidence);
  let remainingTokens = budget.maximumTokens - predicted.tokens;
  let remainingSyllables = budget.maximumSyllables - predicted.syllables;
  let remainingBoundaries = budget.maximumLexicalBoundaries - Math.max(0, predicted.selected.length - 1);
  const copies: RetrievalCandidate[] = [];
  for (const future of candidates) {
    if (!future.commonWord) continue;
    const currentUses = state.entryUses.get(future.entry.id) ?? 0;
    const candidateUse = future.entry.id === candidate.entry.id ? 1 : 0;
    const available = Math.max(
      0,
      budget.maximumSameEntryRepetition - currentUses - candidateUse,
    );
    for (let use = 0; use < available; use += 1) copies.push(future);
  }
  copies.sort((left, right) => left.tokenCount - right.tokenCount
    || left.syllableCount - right.syllableCount
    || compareText(left.entry.id, right.entry.id));
  let reachable = 0;
  for (const future of copies) {
    if (remainingTokens < future.tokenCount
      || remainingSyllables < future.syllableCount
      || remainingBoundaries < 1) continue;
    const futureEvidence = evidenceWithinMaximum(future, predicted, targets);
    if (totalExposure(futureEvidence) === 0) continue;
    remainingTokens -= future.tokenCount;
    remainingSyllables -= future.syllableCount;
    remainingBoundaries -= 1;
    predicted = applyCandidate(predicted, future, futureEvidence);
    reachable += 1;
    if (reachable >= needed) return true;
  }
  return false;
}

function rejectionReasons(
  state: CompositionState,
  candidate: RetrievalCandidate,
  evidence: readonly TargetEvidence[],
  targets: readonly ObjectiveTarget[],
  candidates: readonly RetrievalCandidate[],
  budget: PracticeBudget,
): readonly CandidateRejectionReason[] {
  const reasons: CandidateRejectionReason[] = [];
  const gain = totalExposure(evidence);
  if (gain === 0) {
    reasons.push("target-maximum-reached", "no-marginal-gain");
    return reasons;
  }
  if (state.tokens + candidate.tokenCount > budget.maximumTokens) {
    reasons.push("token-budget-exceeded");
  }
  if (state.syllables + candidate.syllableCount > budget.maximumSyllables) {
    reasons.push("syllable-budget-exceeded");
  }
  const nextBoundaries = state.selected.length;
  if (nextBoundaries > budget.maximumLexicalBoundaries) {
    reasons.push("boundary-budget-exceeded");
  }
  if ((state.entryUses.get(candidate.entry.id) ?? 0) >= budget.maximumSameEntryRepetition) {
    reasons.push("same-entry-repetition-exceeded");
  }
  if (!commonShareRecoverable(
    state,
    candidate,
    evidence,
    targets,
    candidates,
    budget,
  )) {
    reasons.push("common-share-unrecoverable");
  }
  if (!concentrationRecoverable(state, candidate, evidence, targets, candidates, budget)) {
    reasons.push("relation-concentration-unrecoverable");
  }
  if (gain < budget.marginalGainThreshold) {
    reasons.push("marginal-gain-below-threshold");
  }
  return reasons;
}

function selectionReason(strategy: CompositionStrategyId): SelectionReason {
  switch (strategy) {
    case "fixed-six-baseline": return "fixed-six-ranked-pick";
    case "greedy-marginal-gain": return "highest-marginal-gain";
    case "greedy-gain-per-token": return "highest-gain-per-token";
    case "diversity-aware-greedy": return "best-diversity-adjusted-score";
    case "bounded-beam-search": return "beam-search-path-pick";
  }
}

export function strategySelectionReason(strategy: CompositionStrategyId): SelectionReason {
  return selectionReason(strategy);
}

export function scoreCandidates(
  input: Pick<CompositionInput, "budget" | "history" | "policy">,
  state: CompositionState,
  targets: readonly ObjectiveTarget[],
  candidates: readonly RetrievalCandidate[],
  randomTieBreakers: ReadonlyMap<string, number>,
): readonly ScoredCandidate[] {
  const scored = candidates.map((candidate): ScoredCandidate => {
    const selectedEvidence = evidenceWithinMaximum(candidate, state, targets);
    const marginalGain = totalExposure(selectedEvidence);
    const weightedMarginalGain = weightedExposure(selectedEvidence, targets);
    const gainPerToken = candidate.tokenCount === 0 ? 0 : weightedMarginalGain / candidate.tokenCount;
    const repetitionPenalty = state.entryUses.get(candidate.entry.id) ?? 0;
    const samePathUses = state.pathUses.get(candidate.tokenPathSignature) ?? 0;
    const concentration = selectedEvidence.length === 0
      ? 0
      : predictedConcentration(state, candidate, selectedEvidence);
    const diversityPenalty = samePathUses + concentration;
    const recentEntryPenalty = countMatches(input.history.entryIds, candidate.entry.id)
      * input.budget.recentEntryPenalty;
    const recentTokenPathPenalty = countMatches(
      input.history.tokenPathSignatures,
      candidate.tokenPathSignature,
    ) * input.budget.recentTokenPathPenalty;
    const frequencyContribution = candidate.commonWord ? 1 : 0;
    let strategyScore: number;
    switch (input.policy.strategy) {
      case "fixed-six-baseline":
      case "greedy-marginal-gain":
        strategyScore = weightedMarginalGain * 1_000
          + frequencyContribution
          - repetitionPenalty
          - recentEntryPenalty
          - recentTokenPathPenalty;
        break;
      case "greedy-gain-per-token":
        strategyScore = gainPerToken * 1_000
          + frequencyContribution
          - repetitionPenalty
          - recentEntryPenalty
          - recentTokenPathPenalty;
        break;
      case "diversity-aware-greedy":
      case "bounded-beam-search":
        strategyScore = weightedMarginalGain * 1_000
          + frequencyContribution
          - diversityPenalty * 10
          - repetitionPenalty * 10
          - recentEntryPenalty
          - recentTokenPathPenalty;
        break;
    }
    return {
      candidate,
      selectedEvidence,
      weightedMarginalGain,
      score: {
        candidateEntryId: candidate.entry.id,
        marginalGain,
        gainPerToken,
        frequencyContribution,
        diversityPenalty,
        repetitionPenalty,
        recentEntryPenalty,
        recentTokenPathPenalty,
        strategyScore,
        randomTieBreaker: randomTieBreakers.get(candidate.entry.id) ?? 0,
        cost: {
          tokens: candidate.tokenCount,
          syllables: candidate.syllableCount,
          lexicalBoundaries: state.selected.length === 0 ? 0 : 1,
        },
        rejectionReasons: rejectionReasons(
          state,
          candidate,
          selectedEvidence,
          targets,
          candidates,
          input.budget,
        ),
      },
    };
  });
  scored.sort((left, right) => right.score.strategyScore - left.score.strategyScore
    || right.score.marginalGain - left.score.marginalGain
    || right.score.gainPerToken - left.score.gainPerToken
    || right.score.frequencyContribution - left.score.frequencyContribution
    || left.score.diversityPenalty - right.score.diversityPenalty
    || left.score.repetitionPenalty - right.score.repetitionPenalty
    || right.score.randomTieBreaker - left.score.randomTieBreaker
    || compareText(left.candidate.entry.id, right.candidate.entry.id));
  return scored;
}

function incrementMap(source: ReadonlyMap<string, number>, key: string, amount: number): Map<string, number> {
  const next = new Map(source);
  next.set(key, (next.get(key) ?? 0) + amount);
  return next;
}

export function applyCandidate(
  state: CompositionState,
  candidate: RetrievalCandidate,
  selectedEvidence: readonly TargetEvidence[],
): CompositionState {
  const exposureByTarget = new Map(state.exposureByTarget);
  const exposureByTargetAndEntry = new Map<string, ReadonlyMap<string, number>>(
    state.exposureByTargetAndEntry,
  );
  for (const evidence of selectedEvidence) {
    exposureByTarget.set(
      evidence.targetKey,
      (exposureByTarget.get(evidence.targetKey) ?? 0) + evidence.exposureCount,
    );
    const byEntry = new Map(exposureByTargetAndEntry.get(evidence.targetKey) ?? new Map());
    byEntry.set(
      candidate.entry.id,
      (byEntry.get(candidate.entry.id) ?? 0) + evidence.exposureCount,
    );
    exposureByTargetAndEntry.set(evidence.targetKey, byEntry);
  }
  return {
    selected: [...state.selected, candidate],
    selectedEvidence: [...state.selectedEvidence, selectedEvidence],
    exposureByTarget,
    exposureByTargetAndEntry,
    entryUses: incrementMap(state.entryUses, candidate.entry.id, 1),
    pathUses: incrementMap(state.pathUses, candidate.tokenPathSignature, 1),
    tokens: state.tokens + candidate.tokenCount,
    syllables: state.syllables + candidate.syllableCount,
    commonEntries: state.commonEntries + (candidate.commonWord ? 1 : 0),
  };
}

export function targetMinimumSatisfied(
  state: CompositionState,
  targets: readonly ObjectiveTarget[],
): boolean {
  return targets.every((target) => (state.exposureByTarget.get(target.key) ?? 0)
    >= target.exposures.minimum);
}

export function targetPreferredSatisfied(
  state: CompositionState,
  targets: readonly ObjectiveTarget[],
): boolean {
  return targets.every((target) => (state.exposureByTarget.get(target.key) ?? 0)
    >= target.exposures.preferred);
}

export function finalDiversitySatisfied(
  state: CompositionState,
  targets: readonly ObjectiveTarget[],
  budget: PracticeBudget,
): boolean {
  const commonShare = state.selected.length === 0 ? 0 : state.commonEntries / state.selected.length;
  if (commonShare < budget.minimumCommonWordShare) return false;
  for (const target of targets) {
    const total = state.exposureByTarget.get(target.key) ?? 0;
    if (total === 0) continue;
    const byEntry = state.exposureByTargetAndEntry.get(target.key) ?? new Map();
    let maximum = 0;
    for (const exposure of byEntry.values()) maximum = Math.max(maximum, exposure);
    if (maximum / total > budget.maximumRelationConcentration) return false;
  }
  return true;
}

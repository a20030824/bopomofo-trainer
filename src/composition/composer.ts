import type { RelationRef } from "../relations/types.js";
import {
  resolveObjective,
  type ObjectiveResolution,
  type ObjectiveTarget,
} from "./objective.js";
import { retrieveCandidates } from "./retrieval.js";
import {
  applyCandidate,
  emptyCompositionState,
  finalDiversitySatisfied,
  scoreCandidates,
  strategySelectionReason,
  targetMinimumSatisfied,
  targetPreferredSatisfied,
  type CompositionState,
  type ScoredCandidate,
} from "./scoring.js";
import { compareText, stableDigest, stableStringify } from "./stable.js";
import type {
  BudgetUsage,
  CandidateRejectionReason,
  CompositionInput,
  CoverageSummary,
  FallbackReason,
  HigherRankedAlternativeRejection,
  PracticeSequence,
  PracticeSequenceItem,
  RetrievalTrace,
  SelectionTrace,
  StopReason,
  TargetCoverage,
} from "./types.js";

interface CompositionRun {
  readonly state: CompositionState;
  readonly selectionTrace: readonly SelectionTrace[];
  readonly stopReason: StopReason;
  readonly fallbackReasons: readonly FallbackReason[];
}

function emptyRetrievalTrace(
  resolution: Extract<ObjectiveResolution, { readonly ok: false }>,
): RetrievalTrace {
  return {
    candidateEntryIds: [],
    exclusions: [{
      entryId: null,
      targetKey: null,
      reason: resolution.fallbackReason === "coverage-objective-not-composable"
        ? "coverage-objective-requires-explicit-demands"
        : "inconsistent-objective-scope",
      detail: resolution.detail,
    }],
  };
}

function emptyCoverage(): CoverageSummary {
  return {
    targets: [],
    totalTargetExposures: 0,
    distinctSupportingEntries: 0,
    commonWordShare: 0,
    maximumObservedRelationConcentration: 0,
    satisfiedMinimum: false,
    satisfiedPreferred: false,
  };
}

function emptyBudgetUsage(): BudgetUsage {
  return {
    tokens: 0,
    syllables: 0,
    lexicalBoundaries: 0,
    selectedEntries: 0,
    commonEntries: 0,
    entryUses: {},
  };
}

function policyConflictSequence(
  input: CompositionInput,
  resolution: Extract<ObjectiveResolution, { readonly ok: false }>,
): PracticeSequence {
  const retrievalTrace = emptyRetrievalTrace(resolution);
  const body = {
    mode: null,
    layoutId: null,
    objective: input.objective,
    strategy: input.policy.strategy,
    items: [] as const,
    tokenCount: 0,
    syllableCount: 0,
    boundaryCount: 0,
    targetExposureCount: 0,
    selectionTrace: [] as const,
    retrievalTrace,
    coverageSummary: emptyCoverage(),
    budgetUsage: emptyBudgetUsage(),
    stopReason: "policy-conflict" as const,
    fallbackReasons: [resolution.fallbackReason],
  };
  return { id: `practice:${stableDigest(body)}`, ...body };
}

function createRandomTieBreakers(
  input: CompositionInput,
  entryIds: readonly string[],
): ReadonlyMap<string, number> | null {
  const tieBreakers = new Map<string, number>();
  for (const entryId of [...entryIds].sort(compareText)) {
    const value = input.random.next();
    if (!Number.isFinite(value) || value < 0 || value >= 1) return null;
    tieBreakers.set(entryId, value);
  }
  return tieBreakers;
}

function selectionTrace(
  position: number,
  selected: ScoredCandidate,
  ranked: readonly ScoredCandidate[],
  beamPath: boolean,
  strategy: CompositionInput["policy"]["strategy"],
): SelectionTrace {
  const selectedIndex = ranked.findIndex(
    (candidate) => candidate.candidate.entry.id === selected.candidate.entry.id,
  );
  const higherRankedAlternativeRejections: HigherRankedAlternativeRejection[] = ranked
    .slice(0, Math.max(0, selectedIndex))
    .map((candidate) => ({
      candidateEntryId: candidate.candidate.entry.id,
      reasonCodes: candidate.score.rejectionReasons.length > 0
        ? candidate.score.rejectionReasons
        : beamPath
          ? ["beam-path-dominated" as const]
          : [],
    }))
    .filter((rejection) => rejection.reasonCodes.length > 0);
  return {
    position,
    selectedEntryId: selected.candidate.entry.id,
    selectedTargetEvidence: selected.selectedEvidence,
    marginalGain: selected.score.marginalGain,
    tokenCost: selected.score.cost.tokens,
    syllableCost: selected.score.cost.syllables,
    boundaryCost: selected.score.cost.lexicalBoundaries,
    frequencyContribution: selected.score.frequencyContribution,
    diversityPenalty: selected.score.diversityPenalty,
    repetitionPenalty: selected.score.repetitionPenalty,
    recentEntryPenalty: selected.score.recentEntryPenalty,
    recentTokenPathPenalty: selected.score.recentTokenPathPenalty,
    strategyScore: selected.score.strategyScore,
    selectionReason: strategySelectionReason(strategy),
    higherRankedAlternativeRejections,
    rankedCandidates: ranked.map((candidate) => candidate.score),
  };
}

function rejectionSet(scored: readonly ScoredCandidate[]): Set<CandidateRejectionReason> {
  return new Set(scored.flatMap((candidate) => candidate.score.rejectionReasons));
}

function fallbackForPartial(): readonly FallbackReason[] {
  return [
    "support-exhausted-before-preferred",
    "minimum-met-preferred-unreachable",
    "partial-sequence-retained",
  ];
}

function classifyNoSelection(
  state: CompositionState,
  targets: readonly ObjectiveTarget[],
  scored: readonly ScoredCandidate[],
  input: CompositionInput,
): { readonly stopReason: StopReason; readonly fallbackReasons: readonly FallbackReason[] } {
  if (targetPreferredSatisfied(state, targets)
    && finalDiversitySatisfied(state, targets, input.budget)) {
    return { stopReason: "target-satisfied", fallbackReasons: [] };
  }
  if (targetMinimumSatisfied(state, targets)
    && finalDiversitySatisfied(state, targets, input.budget)) {
    return { stopReason: "fallback-completed", fallbackReasons: fallbackForPartial() };
  }
  if (state.selected.length > 0
    && !finalDiversitySatisfied(state, targets, input.budget)) {
    return { stopReason: "insufficient-diverse-support", fallbackReasons: [] };
  }
  if (scored.length === 0 || scored.every((candidate) => candidate.score.marginalGain === 0)) {
    return { stopReason: "no-supporting-candidates", fallbackReasons: [] };
  }
  const reasons = rejectionSet(scored);
  if (reasons.has("marginal-gain-below-threshold")) {
    return { stopReason: "marginal-gain-below-threshold", fallbackReasons: [] };
  }
  if (reasons.has("token-budget-exceeded")) {
    return { stopReason: "token-budget-exhausted", fallbackReasons: [] };
  }
  if (reasons.has("syllable-budget-exceeded")) {
    return { stopReason: "syllable-budget-exhausted", fallbackReasons: [] };
  }
  if (reasons.has("boundary-budget-exceeded")) {
    return { stopReason: "boundary-budget-exhausted", fallbackReasons: [] };
  }
  if (reasons.has("common-share-unrecoverable")
    || reasons.has("relation-concentration-unrecoverable")
    || reasons.has("same-entry-repetition-exceeded")) {
    return { stopReason: "insufficient-diverse-support", fallbackReasons: [] };
  }
  return { stopReason: "policy-conflict", fallbackReasons: [] };
}

function runGreedy(
  input: CompositionInput,
  targets: readonly ObjectiveTarget[],
  candidates: ReturnType<typeof retrieveCandidates>["candidates"],
  tieBreakers: ReadonlyMap<string, number>,
): CompositionRun {
  let state = emptyCompositionState();
  const traces: SelectionTrace[] = [];
  while (true) {
    if (input.policy.strategy !== "fixed-six-baseline"
      && targetPreferredSatisfied(state, targets)
      && finalDiversitySatisfied(state, targets, input.budget)) {
      return { state, selectionTrace: traces, stopReason: "target-satisfied", fallbackReasons: [] };
    }
    if (input.policy.strategy === "fixed-six-baseline" && state.selected.length >= 6) {
      if (targetPreferredSatisfied(state, targets)
        && finalDiversitySatisfied(state, targets, input.budget)) {
        return { state, selectionTrace: traces, stopReason: "target-satisfied", fallbackReasons: [] };
      }
      return {
        state,
        selectionTrace: traces,
        stopReason: "fallback-completed",
        fallbackReasons: ["fixed-six-cap-reached", "partial-sequence-retained"],
      };
    }

    const ranked = scoreCandidates(input, state, targets, candidates, tieBreakers);
    const selected = ranked.find((candidate) => candidate.score.rejectionReasons.length === 0);
    if (selected === undefined) {
      const classified = classifyNoSelection(state, targets, ranked, input);
      return { state, selectionTrace: traces, ...classified };
    }
    traces.push(selectionTrace(
      state.selected.length,
      selected,
      ranked,
      false,
      input.policy.strategy,
    ));
    state = applyCandidate(state, selected.candidate, selected.selectedEvidence);
  }
}

function beamCoverageScore(state: CompositionState, targets: readonly ObjectiveTarget[]): number {
  return targets.reduce((sum, target) => {
    const achieved = state.exposureByTarget.get(target.key) ?? 0;
    return sum + Math.min(achieved, target.exposures.preferred) * target.weight;
  }, 0);
}

function beamRepetition(state: CompositionState): number {
  let total = 0;
  for (const uses of state.entryUses.values()) total += Math.max(0, uses - 1);
  return total;
}

function beamStateKey(state: CompositionState): string {
  return stableStringify(state.selected.map((candidate) => candidate.entry.id));
}

function compareBeamStates(
  left: CompositionState,
  right: CompositionState,
  targets: readonly ObjectiveTarget[],
  input: CompositionInput,
): number {
  const leftPreferred = targetPreferredSatisfied(left, targets)
    && finalDiversitySatisfied(left, targets, input.budget);
  const rightPreferred = targetPreferredSatisfied(right, targets)
    && finalDiversitySatisfied(right, targets, input.budget);
  if (leftPreferred !== rightPreferred) return leftPreferred ? -1 : 1;
  const leftMinimum = targetMinimumSatisfied(left, targets);
  const rightMinimum = targetMinimumSatisfied(right, targets);
  if (leftMinimum !== rightMinimum) return leftMinimum ? -1 : 1;
  const coverage = beamCoverageScore(right, targets) - beamCoverageScore(left, targets);
  if (coverage !== 0) return coverage;
  const diversity = Number(finalDiversitySatisfied(right, targets, input.budget))
    - Number(finalDiversitySatisfied(left, targets, input.budget));
  if (diversity !== 0) return diversity;
  if (left.tokens !== right.tokens) return left.tokens - right.tokens;
  const repetition = beamRepetition(left) - beamRepetition(right);
  if (repetition !== 0) return repetition;
  return compareText(beamStateKey(left), beamStateKey(right));
}

function maximumBeamDepth(
  input: CompositionInput,
  candidates: readonly ReturnType<typeof retrieveCandidates>["candidates"][number][],
): number {
  if (candidates.length === 0) return 0;
  return Math.min(
    64,
    input.budget.maximumTokens,
    input.budget.maximumSyllables,
    input.budget.maximumLexicalBoundaries + 1,
    candidates.length * input.budget.maximumSameEntryRepetition,
  );
}

function findBeamState(
  input: CompositionInput,
  targets: readonly ObjectiveTarget[],
  candidates: ReturnType<typeof retrieveCandidates>["candidates"],
  tieBreakers: ReadonlyMap<string, number>,
): CompositionState {
  let beam: CompositionState[] = [emptyCompositionState()];
  const terminal: CompositionState[] = [];
  const width = Math.max(1, Math.floor(input.policy.beamWidth));
  for (let depth = 0; depth < maximumBeamDepth(input, candidates); depth += 1) {
    const expanded: CompositionState[] = [];
    for (const state of beam) {
      if (targetPreferredSatisfied(state, targets)
        && finalDiversitySatisfied(state, targets, input.budget)) {
        terminal.push(state);
        continue;
      }
      const ranked = scoreCandidates(input, state, targets, candidates, tieBreakers);
      const eligible = ranked
        .filter((candidate) => candidate.score.rejectionReasons.length === 0)
        .slice(0, width);
      if (eligible.length === 0) terminal.push(state);
      for (const candidate of eligible) {
        expanded.push(applyCandidate(state, candidate.candidate, candidate.selectedEvidence));
      }
    }
    if (expanded.length === 0) break;
    const deduplicated = new Map<string, CompositionState>();
    for (const state of expanded) {
      const key = beamStateKey(state);
      const existing = deduplicated.get(key);
      if (existing === undefined
        || compareBeamStates(state, existing, targets, input) < 0) {
        deduplicated.set(key, state);
      }
    }
    beam = [...deduplicated.values()]
      .sort((left, right) => compareBeamStates(left, right, targets, input))
      .slice(0, width);
  }
  const choices = [...terminal, ...beam];
  choices.sort((left, right) => compareBeamStates(left, right, targets, input));
  return choices[0] ?? emptyCompositionState();
}

function runBeam(
  input: CompositionInput,
  targets: readonly ObjectiveTarget[],
  candidates: ReturnType<typeof retrieveCandidates>["candidates"],
  tieBreakers: ReadonlyMap<string, number>,
): CompositionRun {
  const chosen = findBeamState(input, targets, candidates, tieBreakers);
  let replay = emptyCompositionState();
  const traces: SelectionTrace[] = [];
  for (const chosenCandidate of chosen.selected) {
    const ranked = scoreCandidates(input, replay, targets, candidates, tieBreakers);
    const selected = ranked.find(
      (candidate) => candidate.candidate.entry.id === chosenCandidate.entry.id
        && candidate.score.rejectionReasons.length === 0,
    );
    if (selected === undefined) break;
    traces.push(selectionTrace(
      replay.selected.length,
      selected,
      ranked,
      true,
      input.policy.strategy,
    ));
    replay = applyCandidate(replay, selected.candidate, selected.selectedEvidence);
  }
  if (targetPreferredSatisfied(replay, targets)
    && finalDiversitySatisfied(replay, targets, input.budget)) {
    return { state: replay, selectionTrace: traces, stopReason: "target-satisfied", fallbackReasons: [] };
  }
  const ranked = scoreCandidates(input, replay, targets, candidates, tieBreakers);
  const classified = classifyNoSelection(replay, targets, ranked, input);
  return { state: replay, selectionTrace: traces, ...classified };
}

function maximumObservedConcentration(
  state: CompositionState,
  targets: readonly ObjectiveTarget[],
): number {
  let maximum = 0;
  for (const target of targets) {
    const total = state.exposureByTarget.get(target.key) ?? 0;
    if (total === 0) continue;
    const byEntry = state.exposureByTargetAndEntry.get(target.key) ?? new Map();
    for (const exposure of byEntry.values()) maximum = Math.max(maximum, exposure / total);
  }
  return maximum;
}

function coverageSummary(
  state: CompositionState,
  targets: readonly ObjectiveTarget[],
): CoverageSummary {
  const targetCoverage: TargetCoverage[] = targets.map((target) => {
    const achieved = state.exposureByTarget.get(target.key) ?? 0;
    const byEntry = state.exposureByTargetAndEntry.get(target.key) ?? new Map();
    let exactOccurrenceCount = 0;
    let contrastRequirementCount = 0;
    for (const evidence of state.selectedEvidence) {
      const targetEvidence = evidence.find((item) => item.targetKey === target.key);
      exactOccurrenceCount += targetEvidence?.exactOccurrences.length ?? 0;
      contrastRequirementCount += targetEvidence?.contrastRequirements.length ?? 0;
    }
    return {
      targetKey: target.key,
      relation: target.relation,
      minimumExposures: target.exposures.minimum,
      preferredExposures: target.exposures.preferred,
      maximumExposures: target.exposures.maximum,
      achievedExposures: achieved,
      distinctSupportingEntries: [...byEntry.values()].filter((count) => count > 0).length,
      exactOccurrenceCount,
      contrastRequirementCount,
      satisfiedMinimum: achieved >= target.exposures.minimum,
      satisfiedPreferred: achieved >= target.exposures.preferred,
    };
  });
  return {
    targets: targetCoverage,
    totalTargetExposures: targetCoverage.reduce((sum, target) => sum + target.achievedExposures, 0),
    distinctSupportingEntries: new Set(state.selected.map((candidate) => candidate.entry.id)).size,
    commonWordShare: state.selected.length === 0 ? 0 : state.commonEntries / state.selected.length,
    maximumObservedRelationConcentration: maximumObservedConcentration(state, targets),
    satisfiedMinimum: targetCoverage.every((target) => target.satisfiedMinimum),
    satisfiedPreferred: targetCoverage.every((target) => target.satisfiedPreferred),
  };
}

function budgetUsage(state: CompositionState): BudgetUsage {
  return {
    tokens: state.tokens,
    syllables: state.syllables,
    lexicalBoundaries: Math.max(0, state.selected.length - 1),
    selectedEntries: state.selected.length,
    commonEntries: state.commonEntries,
    entryUses: Object.fromEntries(
      [...state.entryUses.entries()].sort(([left], [right]) => compareText(left, right)),
    ),
  };
}

function items(state: CompositionState): readonly PracticeSequenceItem[] {
  return state.selected.map((candidate, index) => ({
    entry: candidate.entry,
    targetEvidence: state.selectedEvidence[index] ?? [],
  }));
}

function invalidRandomSequence(
  input: CompositionInput,
  resolution: Extract<ObjectiveResolution, { readonly ok: true }>,
  retrievalTrace: RetrievalTrace,
): PracticeSequence {
  const body = {
    mode: resolution.mode,
    layoutId: resolution.layoutId,
    objective: input.objective,
    strategy: input.policy.strategy,
    items: [] as const,
    tokenCount: 0,
    syllableCount: 0,
    boundaryCount: 0,
    targetExposureCount: 0,
    selectionTrace: [] as const,
    retrievalTrace,
    coverageSummary: coverageSummary(emptyCompositionState(), resolution.targets),
    budgetUsage: emptyBudgetUsage(),
    stopReason: "policy-conflict" as const,
    fallbackReasons: ["invalid-random-source" as const],
  };
  return { id: `practice:${stableDigest(body)}`, ...body };
}

function confusionFallbackReasons(
  retrievalTrace: RetrievalTrace,
  existing: readonly FallbackReason[],
): readonly FallbackReason[] {
  if (!retrievalTrace.exclusions.some((exclusion) => exclusion.reason === "confusion-pool-missing")) {
    return existing;
  }
  return [...new Set([...existing, "confusion-contrast-pool-missing" as const])];
}

export function composePracticeSequence(input: CompositionInput): PracticeSequence {
  const resolution = resolveObjective(input.objective, input.budget);
  if (!resolution.ok) return policyConflictSequence(input, resolution);

  const retrieval = retrieveCandidates(resolution.targets, input.relationIndex, input.entries);
  const tieBreakers = createRandomTieBreakers(
    input,
    retrieval.candidates.map((candidate) => candidate.entry.id),
  );
  if (tieBreakers === null) {
    return invalidRandomSequence(input, resolution, retrieval.trace);
  }

  const run = input.policy.strategy === "bounded-beam-search"
    ? runBeam(input, resolution.targets, retrieval.candidates, tieBreakers)
    : runGreedy(input, resolution.targets, retrieval.candidates, tieBreakers);
  const coverage = coverageSummary(run.state, resolution.targets);
  const sequenceItems = items(run.state);
  const fallbackReasons = confusionFallbackReasons(retrieval.trace, run.fallbackReasons);
  const body = {
    mode: resolution.mode,
    layoutId: resolution.layoutId,
    objective: input.objective,
    strategy: input.policy.strategy,
    items: sequenceItems,
    tokenCount: run.state.tokens,
    syllableCount: run.state.syllables,
    boundaryCount: Math.max(0, run.state.selected.length - 1),
    targetExposureCount: coverage.totalTargetExposures,
    selectionTrace: run.selectionTrace,
    retrievalTrace: retrieval.trace,
    coverageSummary: coverage,
    budgetUsage: budgetUsage(run.state),
    stopReason: run.stopReason,
    fallbackReasons,
  };
  return { id: `practice:${stableDigest(body)}`, ...body };
}

export function relationCoverage(
  sequence: PracticeSequence,
  relation: RelationRef,
): TargetCoverage | null {
  const key = stableStringify(relation);
  return sequence.coverageSummary.targets.find(
    (target) => stableStringify(target.relation) === key,
  ) ?? null;
}

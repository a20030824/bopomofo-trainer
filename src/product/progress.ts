import type { PracticeMode } from "../core/model.js";
import {
  bindingScopeKey,
  confusionScopeKey,
  transitionScopeKey,
} from "../measurement/aggregate.js";
import type {
  BindingAggregate,
  ConfusionAggregate,
  MeasurementPolicy,
  MeasurementSummary,
  TimingExclusionCounts,
  TransitionAggregate,
} from "../measurement/types.js";
import { createEmptyCurriculumProfile, profileFromAggregates } from "../curriculum/simulator.js";
import type {
  CatalogSupportIndex,
  CurriculumBindingRecord,
  CurriculumProfile,
} from "../curriculum/types.js";
import {
  PRODUCT_PROGRESS_SCHEMA_VERSION,
  type ProductProgress,
  type ProductRoundSummary,
} from "./types.js";

const RECENT_SUMMARY_LIMIT = 12;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0;
}

function finiteNonNegativeOrNull(value: unknown): number | null | undefined {
  if (value === null) return null;
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

function sortedRecord<T>(entries: readonly [string, T][]): Readonly<Record<string, T>> {
  return Object.fromEntries([...entries].sort(([left], [right]) =>
    left < right ? -1 : left > right ? 1 : 0,
  ));
}

function parseTimingExclusions(value: unknown): TimingExclusionCounts | null {
  if (!isRecord(value)) return null;
  const keys = ["syllableStart", "incorrect", "recovery", "interactionNoise"] as const;
  if (keys.some((key) => !isNonNegativeInteger(value[key]))) return null;
  return {
    syllableStart: value.syllableStart as number,
    incorrect: value.incorrect as number,
    recovery: value.recovery as number,
    interactionNoise: value.interactionNoise as number,
  };
}

function parseBindingAggregate(
  value: unknown,
  mode: PracticeMode,
  layoutId: string,
  validTokens: ReadonlySet<string>,
): BindingAggregate | null {
  if (!isRecord(value) || !isRecord(value.scope)) return null;
  const tokenId = value.scope.tokenId;
  if (
    value.scope.mode !== mode
    || value.scope.layoutId !== layoutId
    || typeof tokenId !== "string"
    || !validTokens.has(tokenId)
    || !isNonNegativeInteger(value.attempts)
    || !isNonNegativeInteger(value.errors)
    || !isNonNegativeInteger(value.timingSamples)
    || (value.errors as number) > (value.attempts as number)
    || (value.timingSamples as number) > (value.attempts as number)
  ) return null;
  const current = finiteNonNegativeOrNull(value.currentTimeToTypeMs);
  const best = finiteNonNegativeOrNull(value.bestTimeToTypeMs);
  const exclusions = parseTimingExclusions(value.timingExclusions);
  if (current === undefined || best === undefined || exclusions === null) return null;
  if ((value.timingSamples as number) === 0 && (current !== null || best !== null)) return null;
  if ((value.timingSamples as number) > 0 && (current === null || best === null)) return null;
  return {
    scope: { mode, layoutId, tokenId },
    attempts: value.attempts as number,
    errors: value.errors as number,
    timingSamples: value.timingSamples as number,
    currentTimeToTypeMs: current,
    bestTimeToTypeMs: best,
    timingExclusions: exclusions,
  };
}

function parseConfusionAggregate(
  value: unknown,
  mode: PracticeMode,
  layoutId: string,
  validTokens: ReadonlySet<string>,
): ConfusionAggregate | null {
  if (!isRecord(value) || !isRecord(value.scope)) return null;
  const expectedToken = value.scope.expectedToken;
  const actualToken = value.scope.actualToken;
  if (
    value.scope.mode !== mode
    || value.scope.layoutId !== layoutId
    || typeof expectedToken !== "string"
    || typeof actualToken !== "string"
    || !validTokens.has(expectedToken)
    || !validTokens.has(actualToken)
    || !isNonNegativeInteger(value.occurrences)
    || value.occurrences === 0
  ) return null;
  return {
    scope: { mode, layoutId, expectedToken, actualToken },
    occurrences: value.occurrences as number,
  };
}

function parseTransitionAggregate(
  value: unknown,
  mode: PracticeMode,
  layoutId: string,
  validTokens: ReadonlySet<string>,
): TransitionAggregate | null {
  if (!isRecord(value) || !isRecord(value.scope)) return null;
  const fromToken = value.scope.fromToken;
  const toToken = value.scope.toToken;
  const current = finiteNonNegativeOrNull(value.currentTimeToTypeMs);
  const best = finiteNonNegativeOrNull(value.bestTimeToTypeMs);
  if (
    value.scope.mode !== mode
    || value.scope.layoutId !== layoutId
    || typeof fromToken !== "string"
    || typeof toToken !== "string"
    || !validTokens.has(fromToken)
    || !validTokens.has(toToken)
    || !isNonNegativeInteger(value.timingSamples)
    || value.timingSamples === 0
    || current === null
    || current === undefined
    || best === null
    || best === undefined
  ) return null;
  return {
    scope: { mode, layoutId, fromToken, toToken },
    timingSamples: value.timingSamples as number,
    currentTimeToTypeMs: current,
    bestTimeToTypeMs: best,
  };
}

function parseMeasurementSummary(
  value: unknown,
  policy: MeasurementPolicy,
  mode: PracticeMode,
  layoutId: string,
  validTokens: ReadonlySet<string>,
): MeasurementSummary | null {
  if (
    !isRecord(value)
    || value.policyVersion !== policy.version
    || !isNonNegativeInteger(value.traceCount)
    || !isNonNegativeInteger(value.bindingObservationCount)
    || !isNonNegativeInteger(value.confusionObservationCount)
    || !isNonNegativeInteger(value.transitionObservationCount)
    || !isRecord(value.bindings)
    || !isRecord(value.confusions)
    || !isRecord(value.transitions)
  ) return null;

  const bindings: [string, BindingAggregate][] = [];
  for (const candidate of Object.values(value.bindings)) {
    const aggregate = parseBindingAggregate(candidate, mode, layoutId, validTokens);
    if (aggregate === null) return null;
    const key = bindingScopeKey(aggregate.scope);
    if (bindings.some(([existing]) => existing === key)) return null;
    bindings.push([key, aggregate]);
  }
  const confusions: [string, ConfusionAggregate][] = [];
  for (const candidate of Object.values(value.confusions)) {
    const aggregate = parseConfusionAggregate(candidate, mode, layoutId, validTokens);
    if (aggregate === null) return null;
    const key = confusionScopeKey(aggregate.scope);
    if (confusions.some(([existing]) => existing === key)) return null;
    confusions.push([key, aggregate]);
  }
  const transitions: [string, TransitionAggregate][] = [];
  for (const candidate of Object.values(value.transitions)) {
    const aggregate = parseTransitionAggregate(candidate, mode, layoutId, validTokens);
    if (aggregate === null) return null;
    const key = transitionScopeKey(aggregate.scope);
    if (transitions.some(([existing]) => existing === key)) return null;
    transitions.push([key, aggregate]);
  }

  const bindingCount = bindings.reduce((sum, [, aggregate]) => sum + aggregate.attempts, 0);
  const confusionCount = confusions.reduce((sum, [, aggregate]) => sum + aggregate.occurrences, 0);
  const transitionCount = transitions.reduce((sum, [, aggregate]) => sum + aggregate.timingSamples, 0);
  if (
    bindingCount !== value.bindingObservationCount
    || confusionCount !== value.confusionObservationCount
    || transitionCount !== value.transitionObservationCount
    || bindingCount > (value.traceCount as number)
    || confusionCount > (value.traceCount as number)
    || transitionCount > (value.traceCount as number)
  ) return null;

  return {
    policyVersion: policy.version,
    traceCount: value.traceCount as number,
    bindingObservationCount: bindingCount,
    confusionObservationCount: confusionCount,
    transitionObservationCount: transitionCount,
    bindings: sortedRecord(bindings),
    confusions: sortedRecord(confusions),
    transitions: sortedRecord(transitions),
  };
}

function parseSummary(value: unknown): ProductRoundSummary | null {
  if (!isRecord(value) || !Array.isArray(value.entryIds)) return null;
  const kind = value.kind;
  const phase = value.phase;
  const focusEvidence = value.focusEvidence;
  if (
    (kind !== "practice" && kind !== "evaluation")
    || typeof value.exerciseId !== "string"
    || typeof value.completedAt !== "string"
    || Number.isNaN(Date.parse(value.completedAt))
    || value.entryIds.some((entryId) => typeof entryId !== "string")
    || (phase !== "coverage" && phase !== "adaptive" && phase !== "evaluation")
    || (value.focusTokenId !== null && typeof value.focusTokenId !== "string")
    || (focusEvidence !== null && focusEvidence !== "timed" && focusEvidence !== "correctness-only")
    || !isNonNegativeInteger(value.attempts)
    || !isNonNegativeInteger(value.errors)
    || !isNonNegativeInteger(value.timingSamples)
    || (value.errors as number) > (value.attempts as number)
    || (value.timingSamples as number) > (value.attempts as number)
  ) return null;
  if (kind === "evaluation" && (phase !== "evaluation" || value.focusTokenId !== null || focusEvidence !== null)) return null;
  if (kind === "practice" && phase === "evaluation") return null;
  if ((value.focusTokenId === null) !== (focusEvidence === null)) return null;
  return {
    kind,
    exerciseId: value.exerciseId,
    completedAt: value.completedAt,
    entryIds: value.entryIds as string[],
    phase,
    focusTokenId: value.focusTokenId as string | null,
    focusEvidence,
    attempts: value.attempts as number,
    errors: value.errors as number,
    timingSamples: value.timingSamples as number,
  };
}

export function createEmptyMeasurementSummary(policy: MeasurementPolicy): MeasurementSummary {
  return {
    policyVersion: policy.version,
    traceCount: 0,
    bindingObservationCount: 0,
    confusionObservationCount: 0,
    transitionObservationCount: 0,
    bindings: {},
    confusions: {},
    transitions: {},
  };
}

export function createFreshProductProgress(
  support: CatalogSupportIndex,
  seed: string,
  mode: PracticeMode,
  layoutId: string,
  measurementPolicy: MeasurementPolicy,
  curriculumPolicyVersion: string,
): ProductProgress {
  if (seed.length === 0) throw new Error("product seed must not be empty");
  return {
    schemaVersion: PRODUCT_PROGRESS_SCHEMA_VERSION,
    seed,
    mode,
    layoutId,
    measurements: createEmptyMeasurementSummary(measurementPolicy),
    curriculumPolicyVersion,
    curriculum: createEmptyCurriculumProfile(support, mode, layoutId),
    practiceRoundsCompleted: 0,
    evaluationRoundsCompleted: 0,
    recentSummaries: [],
  };
}

export function serializeProductProgress(progress: ProductProgress): string {
  const lastFocusedRounds = Object.fromEntries(
    Object.entries(progress.curriculum.bindings).map(([tokenId, record]) => [
      tokenId,
      record.lastFocusedRound,
    ]),
  );
  return JSON.stringify({
    schemaVersion: progress.schemaVersion,
    seed: progress.seed,
    mode: progress.mode,
    layoutId: progress.layoutId,
    measurements: progress.measurements,
    curriculumPolicyVersion: progress.curriculumPolicyVersion,
    curriculum: {
      round: progress.curriculum.round,
      lastFocusedRounds,
      recentEntryIds: progress.curriculum.recentEntryIds,
      recentTokenIds: progress.curriculum.recentTokenIds,
    },
    practiceRoundsCompleted: progress.practiceRoundsCompleted,
    evaluationRoundsCompleted: progress.evaluationRoundsCompleted,
    recentSummaries: progress.recentSummaries,
  });
}

export function parseProductProgress(
  source: string,
  support: CatalogSupportIndex,
  expectedMode: PracticeMode,
  expectedLayoutId: string,
  measurementPolicy: MeasurementPolicy,
  expectedCurriculumPolicyVersion: string,
): ProductProgress | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source) as unknown;
  } catch {
    return null;
  }
  if (
    !isRecord(parsed)
    || parsed.schemaVersion !== PRODUCT_PROGRESS_SCHEMA_VERSION
    || typeof parsed.seed !== "string"
    || parsed.seed.length === 0
    || parsed.mode !== expectedMode
    || parsed.layoutId !== expectedLayoutId
    || parsed.curriculumPolicyVersion !== expectedCurriculumPolicyVersion
    || !isNonNegativeInteger(parsed.practiceRoundsCompleted)
    || !isNonNegativeInteger(parsed.evaluationRoundsCompleted)
    || !Array.isArray(parsed.recentSummaries)
    || !isRecord(parsed.curriculum)
    || !isNonNegativeInteger(parsed.curriculum.round)
    || parsed.curriculum.round !== parsed.practiceRoundsCompleted
    || !isRecord(parsed.curriculum.lastFocusedRounds)
    || !Array.isArray(parsed.curriculum.recentEntryIds)
    || !Array.isArray(parsed.curriculum.recentTokenIds)
  ) return null;

  const validTokens = new Set(Object.keys(support.byToken));
  const measurements = parseMeasurementSummary(
    parsed.measurements,
    measurementPolicy,
    expectedMode,
    expectedLayoutId,
    validTokens,
  );
  if (measurements === null) return null;

  const recentEntryIds = parsed.curriculum.recentEntryIds;
  const recentTokenIds = parsed.curriculum.recentTokenIds;
  if (
    recentEntryIds.some((entryId) =>
      typeof entryId !== "string" || support.entriesById[entryId] === undefined,
    )
    || recentTokenIds.some((tokenId) =>
      typeof tokenId !== "string" || !validTokens.has(tokenId),
    )
  ) return null;

  const summaries = parsed.recentSummaries.map(parseSummary);
  if (summaries.some((summary) => summary === null)) return null;

  const curriculumBase = profileFromAggregates(
    support,
    expectedMode,
    expectedLayoutId,
    Object.values(measurements.bindings),
    parsed.curriculum.round as number,
  );
  const bindings: Record<string, CurriculumBindingRecord> = {};
  for (const [tokenId, record] of Object.entries(curriculumBase.bindings)) {
    const value = parsed.curriculum.lastFocusedRounds[tokenId];
    if (
      value !== null
      && (!isNonNegativeInteger(value) || (value as number) > curriculumBase.round)
    ) return null;
    bindings[tokenId] = { ...record, lastFocusedRound: value as number | null };
  }

  const curriculum: CurriculumProfile = {
    ...curriculumBase,
    bindings,
    recentEntryIds: recentEntryIds as string[],
    recentTokenIds: recentTokenIds as string[],
  };
  return {
    schemaVersion: PRODUCT_PROGRESS_SCHEMA_VERSION,
    seed: parsed.seed,
    mode: expectedMode,
    layoutId: expectedLayoutId,
    measurements,
    curriculumPolicyVersion: expectedCurriculumPolicyVersion,
    curriculum,
    practiceRoundsCompleted: parsed.practiceRoundsCompleted as number,
    evaluationRoundsCompleted: parsed.evaluationRoundsCompleted as number,
    recentSummaries: (summaries as ProductRoundSummary[]).slice(-RECENT_SUMMARY_LIMIT),
  };
}

export function appendRecentSummary(
  progress: ProductProgress,
  summary: ProductRoundSummary,
): readonly ProductRoundSummary[] {
  return [...progress.recentSummaries, summary].slice(-RECENT_SUMMARY_LIMIT);
}

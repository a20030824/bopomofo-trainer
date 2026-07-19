import type { InteractionInput } from "../practice/interaction-session.js";
import {
  applyInteractionInput,
  createInteractionSession,
} from "../practice/interaction-session.js";
import { aggregateMeasurements } from "../measurement/aggregate.js";
import { deriveMeasurementDecisions } from "../measurement/derive-observations.js";
import { PHASE_3_MEASUREMENT_POLICY } from "../measurement/policy.js";
import { buildCurriculumExercise } from "../curriculum/exercise-builder.js";
import { selectCurriculumFocus } from "../curriculum/focus.js";
import { PHASE_4_CURRICULUM_POLICY } from "../curriculum/policy.js";
import { createSeededRandom } from "../curriculum/random.js";
import { createCatalogSupportIndex, entryTokenSet } from "../curriculum/support.js";
import type {
  CurriculumBindingRecord,
  CurriculumPolicy,
  CurriculumProfile,
} from "../curriculum/types.js";
import {
  appendRecentSummary,
  createFreshProductProgress,
} from "./progress.js";
import type {
  ProductCatalogs,
  ProductEnvironment,
  ProductProgress,
  ProductRound,
  ProductRoundSummary,
  ProductState,
} from "./types.js";

export const DEFAULT_EVALUATION_INTERVAL = 5;
export const DEFAULT_EVALUATION_ENTRY_COUNT = 3;

export function createProductEnvironment(
  catalogs: ProductCatalogs,
  evaluationInterval = DEFAULT_EVALUATION_INTERVAL,
  evaluationEntryCount = DEFAULT_EVALUATION_ENTRY_COUNT,
): ProductEnvironment {
  if (!Number.isInteger(evaluationInterval) || evaluationInterval <= 0) {
    throw new RangeError("evaluationInterval must be a positive integer");
  }
  if (!Number.isInteger(evaluationEntryCount) || evaluationEntryCount <= 0) {
    throw new RangeError("evaluationEntryCount must be a positive integer");
  }
  if (catalogs.practice.length === 0 || catalogs.evaluation.length === 0) {
    throw new Error("product requires both practice and evaluation catalog entries");
  }
  return {
    catalogs,
    practiceSupport: createCatalogSupportIndex(catalogs.practice),
    evaluationSupport: createCatalogSupportIndex(catalogs.evaluation),
    measurementPolicy: PHASE_3_MEASUREMENT_POLICY,
    curriculumPolicy: PHASE_4_CURRICULUM_POLICY,
    evaluationInterval,
    evaluationEntryCount,
  };
}

export function createFreshProgressForEnvironment(
  environment: ProductEnvironment,
  seed: string,
  mode: ProductProgress["mode"],
  layoutId: string,
): ProductProgress {
  return createFreshProductProgress(
    environment.practiceSupport,
    seed,
    mode,
    layoutId,
    environment.measurementPolicy,
    environment.curriculumPolicy.version,
  );
}

function evaluationDue(
  progress: ProductProgress,
  environment: ProductEnvironment,
): boolean {
  const scheduled = Math.floor(
    progress.practiceRoundsCompleted / environment.evaluationInterval,
  );
  return scheduled > progress.evaluationRoundsCompleted;
}

function evaluationPolicy(environment: ProductEnvironment): CurriculumPolicy {
  return {
    ...environment.curriculumPolicy,
    exerciseEntryCount: Math.min(
      environment.evaluationEntryCount,
      environment.catalogs.evaluation.length,
    ),
    focusedEntryShare: 0,
  };
}

function selectRound(
  environment: ProductEnvironment,
  progress: ProductProgress,
): ProductRound {
  if (evaluationDue(progress, environment)) {
    const built = buildCurriculumExercise(
      environment.evaluationSupport,
      progress.curriculum,
      null,
      null,
      evaluationPolicy(environment),
      createSeededRandom(
        `${progress.seed}:evaluation:${progress.evaluationRoundsCompleted}`,
      ),
    );
    return {
      kind: "evaluation",
      exercise: {
        ...built.exercise,
        id: `evaluation-${progress.evaluationRoundsCompleted + 1}`,
      },
      focus: null,
    };
  }

  const focus = selectCurriculumFocus(
    progress.curriculum,
    environment.practiceSupport,
    environment.curriculumPolicy,
  );
  const built = buildCurriculumExercise(
    environment.practiceSupport,
    progress.curriculum,
    focus.tokenId,
    focus.evidence,
    environment.curriculumPolicy,
    createSeededRandom(`${progress.seed}:practice:${progress.curriculum.round}`),
  );
  return {
    kind: "practice",
    exercise: {
      ...built.exercise,
      id: `practice-${progress.curriculum.round + 1}`,
    },
    focus,
  };
}

export function createProductState(
  environment: ProductEnvironment,
  progress: ProductProgress,
  startedAtMs: number,
): ProductState {
  const round = selectRound(environment, progress);
  return {
    progress,
    round,
    session: createInteractionSession(round.exercise, startedAtMs),
    summary: null,
  };
}

function sumSessionMetrics(measurements: ReturnType<typeof aggregateMeasurements>): {
  readonly attempts: number;
  readonly errors: number;
  readonly timingSamples: number;
} {
  return Object.values(measurements.bindings).reduce(
    (totals, aggregate) => ({
      attempts: totals.attempts + aggregate.attempts,
      errors: totals.errors + aggregate.errors,
      timingSamples: totals.timingSamples + aggregate.timingSamples,
    }),
    { attempts: 0, errors: 0, timingSamples: 0 },
  );
}

function updateCurriculumAfterPractice(
  profile: CurriculumProfile,
  cumulativeMeasurements: ProductProgress["measurements"],
  round: ProductRound,
): CurriculumProfile {
  const aggregates = new Map(
    Object.values(cumulativeMeasurements.bindings).map((aggregate) => [
      aggregate.scope.tokenId,
      aggregate,
    ]),
  );
  const bindings: Record<string, CurriculumBindingRecord> = {};
  for (const [tokenId, record] of Object.entries(profile.bindings)) {
    bindings[tokenId] = {
      ...record,
      aggregate: aggregates.get(tokenId) ?? record.aggregate,
      lastFocusedRound: round.focus?.tokenId === tokenId
        ? profile.round
        : record.lastFocusedRound,
    };
  }
  const recentTokenIds = [
    ...new Set(round.exercise.entries.flatMap((entry) => [...entryTokenSet(entry)])),
  ];
  return {
    ...profile,
    round: profile.round + 1,
    bindings,
    recentEntryIds: round.exercise.entries.map((entry) => entry.id),
    recentTokenIds,
  };
}

function finalizeRound(
  environment: ProductEnvironment,
  state: ProductState,
  completedAt: string,
): ProductState {
  const decisions = deriveMeasurementDecisions(
    state.round.exercise,
    state.session.traces,
    environment.measurementPolicy,
  );
  const sessionMeasurements = aggregateMeasurements(
    decisions,
    environment.measurementPolicy,
  );
  const metrics = sumSessionMetrics(sessionMeasurements);
  const summary: ProductRoundSummary = {
    kind: state.round.kind,
    exerciseId: state.round.exercise.id,
    completedAt,
    entryIds: state.round.exercise.entries.map((entry) => entry.id),
    phase: state.round.kind === "evaluation"
      ? "evaluation"
      : state.round.focus!.phase,
    focusTokenId: state.round.focus?.tokenId ?? null,
    focusEvidence: state.round.focus?.evidence ?? null,
    ...metrics,
  };

  if (state.round.kind === "evaluation") {
    const progress: ProductProgress = {
      ...state.progress,
      evaluationRoundsCompleted: state.progress.evaluationRoundsCompleted + 1,
      recentSummaries: appendRecentSummary(state.progress, summary),
    };
    return { ...state, progress, summary };
  }

  const measurements = aggregateMeasurements(
    decisions,
    environment.measurementPolicy,
    state.progress.measurements,
  );
  const curriculum = updateCurriculumAfterPractice(
    state.progress.curriculum,
    measurements,
    state.round,
  );
  const progress: ProductProgress = {
    ...state.progress,
    measurements,
    curriculum,
    practiceRoundsCompleted: state.progress.practiceRoundsCompleted + 1,
    recentSummaries: appendRecentSummary(state.progress, summary),
  };
  return { ...state, progress, summary };
}

export function applyProductInput(
  environment: ProductEnvironment,
  state: ProductState,
  input: InteractionInput,
  completedAt: string,
): ProductState {
  if (state.summary !== null || state.session.completed) return state;
  const session = applyInteractionInput(state.session, input);
  const next = { ...state, session };
  return session.completed ? finalizeRound(environment, next, completedAt) : next;
}

export function startNextProductRound(
  environment: ProductEnvironment,
  state: ProductState,
  startedAtMs: number,
): ProductState {
  if (state.summary === null) {
    throw new Error("cannot start the next round before completing the current round");
  }
  return createProductState(environment, state.progress, startedAtMs);
}

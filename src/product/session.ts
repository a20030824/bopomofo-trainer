import type {
  InteractionInput,
  InteractionTrace,
} from "../practice/interaction-session.js";
import {
  applyInteractionInput,
  createInteractionSession,
} from "../practice/interaction-session.js";
import { aggregateMeasurements } from "../measurement/aggregate.js";
import { deriveMeasurementDecisions } from "../measurement/derive-observations.js";
import { PHASE_3_MEASUREMENT_POLICY } from "../measurement/policy.js";
import {
  FREQUENCY_FIRST_UTTERANCE_POLICY,
  selectFrequencyFirstUtterance,
  updateFrequencyFirstSelectionState,
  validateFrequencyFirstUtterancePolicy,
  type FrequencyFirstUtterancePolicy,
} from "../curriculum/frequency-first-utterance.js";
import { PHASE_4_CURRICULUM_POLICY } from "../curriculum/policy.js";
import { createSeededRandom } from "../curriculum/random.js";
import { createCatalogSupportIndex, entryTokenSet } from "../curriculum/support.js";
import type {
  CurriculumBindingRecord,
  CurriculumProfile,
} from "../curriculum/types.js";
import {
  appendRecentSummary,
  createEmptyMeasurementSummary,
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

function validateGrammarCoverage(catalogs: ProductCatalogs): void {
  const allEntries = [...catalogs.practice, ...catalogs.evaluation];
  for (const entry of allEntries) {
    const annotation = catalogs.grammarAnnotations[entry.id];
    if (annotation === undefined) {
      throw new Error(`product catalog entry is missing grammar annotation: ${entry.id}`);
    }
    if (annotation.entryId !== entry.id) {
      throw new Error(`grammar annotation identity mismatch: ${entry.id}`);
    }
  }
}

export function createProductEnvironment(
  catalogs: ProductCatalogs,
  evaluationInterval = DEFAULT_EVALUATION_INTERVAL,
  evaluationEntryCount = DEFAULT_EVALUATION_ENTRY_COUNT,
  utterancePolicy: FrequencyFirstUtterancePolicy = FREQUENCY_FIRST_UTTERANCE_POLICY,
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
  const practiceIds = new Set(catalogs.practice.map((entry) => entry.id));
  const evaluationIds = new Set(catalogs.evaluation.map((entry) => entry.id));
  if (practiceIds.size !== catalogs.practice.length) {
    throw new Error("practice catalog contains duplicate entry IDs");
  }
  if (evaluationIds.size !== catalogs.evaluation.length) {
    throw new Error("evaluation catalog contains duplicate entry IDs");
  }
  if ([...evaluationIds].some((entryId) => practiceIds.has(entryId))) {
    throw new Error("practice and evaluation catalogs must be disjoint");
  }
  validateGrammarCoverage(catalogs);
  validateFrequencyFirstUtterancePolicy(utterancePolicy);
  return {
    catalogs,
    practiceSupport: createCatalogSupportIndex(catalogs.practice),
    evaluationSupport: createCatalogSupportIndex(catalogs.evaluation),
    measurementPolicy: PHASE_3_MEASUREMENT_POLICY,
    curriculumPolicy: PHASE_4_CURRICULUM_POLICY,
    utterancePolicy,
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
    environment.utterancePolicy,
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

function selectRound(
  environment: ProductEnvironment,
  progress: ProductProgress,
): ProductRound {
  const evaluation = evaluationDue(progress, environment);
  const selection = selectFrequencyFirstUtterance({
    entries: evaluation
      ? environment.catalogs.evaluation
      : environment.catalogs.practice,
    annotations: environment.catalogs.grammarAnnotations,
    measurement: evaluation
      ? createEmptyMeasurementSummary(environment.measurementPolicy)
      : progress.measurements,
    mode: progress.mode,
    layoutId: progress.layoutId,
    stage: evaluation ? 3 : progress.selection.stage,
    history: evaluation
      ? {
        recentEntryIds: [],
        recentUtteranceIds: [],
        recentTemplateIds: [],
      }
      : {
        recentEntryIds: progress.curriculum.recentEntryIds,
        recentUtteranceIds: progress.selection.recentUtteranceIds,
        recentTemplateIds: progress.selection.recentTemplateIds,
      },
    policy: environment.utterancePolicy,
    random: createSeededRandom(
      evaluation
        ? `${progress.seed}:evaluation:${progress.evaluationRoundsCompleted}`
        : `${progress.seed}:practice:${progress.practiceRoundsCompleted}`,
    ),
  });
  const kind = evaluation ? "evaluation" : "practice";
  const number = evaluation
    ? progress.evaluationRoundsCompleted + 1
    : progress.practiceRoundsCompleted + 1;
  return {
    kind,
    exercise: {
      id: `${kind}-${number}`,
      mode: progress.mode,
      layoutId: progress.layoutId,
      entries: selection.utterance.entries,
    },
    focus: null,
    selection,
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

function sumSessionMetrics(
  traces: readonly InteractionTrace[],
  measurements: ReturnType<typeof aggregateMeasurements>,
): {
  readonly attempts: number;
  readonly errors: number;
  readonly timingSamples: number;
} {
  const interaction = traces.reduce(
    (totals, trace) => {
      if (trace.outcome !== "correct" && trace.outcome !== "incorrect") {
        return totals;
      }
      return {
        attempts: totals.attempts + 1,
        errors: totals.errors + (trace.outcome === "incorrect" ? 1 : 0),
      };
    },
    { attempts: 0, errors: 0 },
  );
  const timingSamples = Object.values(measurements.bindings).reduce(
    (total, aggregate) => total + aggregate.timingSamples,
    0,
  );
  return { ...interaction, timingSamples };
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
  const metrics = sumSessionMetrics(state.session.traces, sessionMeasurements);
  const summary: ProductRoundSummary = {
    kind: state.round.kind,
    exerciseId: state.round.exercise.id,
    completedAt,
    entryIds: state.round.exercise.entries.map((entry) => entry.id),
    utteranceId: state.round.selection.utterance.id,
    templateId: state.round.selection.utterance.templateId,
    frequencyStage: state.round.selection.stage,
    phase: state.round.kind === "evaluation"
      ? "evaluation"
      : state.round.selection.stage === 1
        ? "coverage"
        : "adaptive",
    focusTokenId: null,
    focusEvidence: null,
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
  const selection = updateFrequencyFirstSelectionState(
    state.progress.selection,
    state.round.selection,
    metrics.attempts,
    metrics.errors,
    environment.utterancePolicy,
  );
  const progress: ProductProgress = {
    ...state.progress,
    measurements,
    curriculum,
    selection,
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

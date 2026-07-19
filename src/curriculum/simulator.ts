import type { BindingAggregate } from "../measurement/types.js";
import { buildCurriculumExercise } from "./exercise-builder.js";
import { validateCurriculumPolicy } from "./policy.js";
import { selectCurriculumFocus } from "./focus.js";
import { createSeededRandom } from "./random.js";
import { classifyBindingStates } from "./state.js";
import { entryTokenSet } from "./support.js";
import type {
  CatalogSupportIndex,
  CurriculumBindingRecord,
  CurriculumPolicy,
  CurriculumProfile,
  CurriculumSimulationReport,
  SimulationRoundReport,
} from "./types.js";

export interface SyntheticPerformance {
  readonly timingMs: number;
  readonly errorRate: number;
}

export interface SimulationScenario {
  readonly name: string;
  readonly seed: string;
  readonly rounds: number;
  readonly profile: CurriculumProfile;
  readonly performance: Readonly<Record<string, SyntheticPerformance>>;
}

function emptyExclusions() {
  return { syllableStart: 0, incorrect: 0, recovery: 0, interactionNoise: 0 } as const;
}

function updateAggregate(
  previous: BindingAggregate | null,
  record: CurriculumBindingRecord,
  performance: SyntheticPerformance,
  randomValue: number,
): BindingAggregate {
  const error = randomValue < performance.errorRate;
  const previousTiming = previous?.currentTimeToTypeMs ?? null;
  const timing = error
    ? previousTiming
    : previousTiming === null
      ? performance.timingMs
      : previousTiming + 0.25 * (performance.timingMs - previousTiming);
  return {
    scope: record.scope,
    attempts: (previous?.attempts ?? 0) + 1,
    errors: (previous?.errors ?? 0) + (error ? 1 : 0),
    timingSamples: (previous?.timingSamples ?? 0) + (error ? 0 : 1),
    currentTimeToTypeMs: timing === null ? null : Math.round(timing * 1000) / 1000,
    bestTimeToTypeMs: error
      ? previous?.bestTimeToTypeMs ?? null
      : previous?.bestTimeToTypeMs === null || previous?.bestTimeToTypeMs === undefined
        ? performance.timingMs
        : Math.min(previous.bestTimeToTypeMs, performance.timingMs),
    timingExclusions: previous?.timingExclusions ?? emptyExclusions(),
  };
}

function countExposure(
  entries: readonly {
    readonly syllables: readonly { readonly tokens: readonly string[] }[];
  }[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const entry of entries) {
    for (const syllable of entry.syllables) {
      for (const tokenId of syllable.tokens) {
        counts[tokenId] = (counts[tokenId] ?? 0) + 1;
      }
    }
  }
  return counts;
}

export function createEmptyCurriculumProfile(
  support: CatalogSupportIndex,
  mode: CurriculumProfile["mode"],
  layoutId: string,
): CurriculumProfile {
  const bindings: Record<string, CurriculumBindingRecord> = {};
  for (const tokenId of Object.keys(support.byToken)) {
    bindings[tokenId] = {
      scope: { mode, layoutId, tokenId },
      aggregate: null,
      lastFocusedRound: null,
    };
  }
  return {
    mode,
    layoutId,
    round: 0,
    bindings,
    recentEntryIds: [],
    recentTokenIds: [],
  };
}

export function runCurriculumSimulation(
  support: CatalogSupportIndex,
  policy: CurriculumPolicy,
  scenario: SimulationScenario,
): CurriculumSimulationReport {
  validateCurriculumPolicy(policy);
  const random = createSeededRandom(scenario.seed);
  let profile = scenario.profile;
  const rounds: SimulationRoundReport[] = [];
  let previousStates = new Map<
    string,
    SimulationRoundReport["states"][number]["state"]
  >();

  for (let roundIndex = 0; roundIndex < scenario.rounds; roundIndex += 1) {
    const focus = selectCurriculumFocus(profile, support, policy);
    const states = classifyBindingStates(profile, support, policy, focus.tokenId);
    const built = buildCurriculumExercise(support, profile, focus.tokenId, policy, random);
    const stateTransitions = states.flatMap((state) => {
      const from = previousStates.get(state.tokenId) ?? null;
      return from === state.state
        ? []
        : [{ tokenId: state.tokenId, from, to: state.state, reason: state.reason }];
    });
    const tokenExposure = countExposure(built.exercise.entries);
    const frequencyBands = { "1": 0, "2": 0, "3": 0 };
    for (const entry of built.exercise.entries) {
      frequencyBands[String(entry.frequencyBand) as "1" | "2" | "3"] += 1;
    }
    const repeatedEntryCount = built.exercise.entries.filter(
      (entry) => profile.recentEntryIds.includes(entry.id),
    ).length;

    rounds.push({
      round: profile.round,
      phase: focus.phase,
      focus,
      states,
      stateTransitions,
      exerciseEntryIds: built.exercise.entries.map((entry) => entry.id),
      tokenExposure,
      frequencyBands,
      repeatedEntryCount,
      fallbackReasons: built.fallbackReasons,
      picks: built.picks,
    });
    previousStates = new Map(states.map((state) => [state.tokenId, state.state]));

    const bindings: Record<string, CurriculumBindingRecord> = { ...profile.bindings };
    for (const [tokenId, exposure] of Object.entries(tokenExposure)) {
      const record = bindings[tokenId];
      if (record === undefined) continue;
      let aggregate = record.aggregate;
      const performance = scenario.performance[tokenId]
        ?? { timingMs: 180, errorRate: 0.03 };
      for (let index = 0; index < exposure; index += 1) {
        aggregate = updateAggregate(aggregate, record, performance, random.next());
      }
      bindings[tokenId] = { ...record, aggregate };
    }
    if (focus.tokenId !== null) {
      const record = bindings[focus.tokenId];
      if (record !== undefined) {
        bindings[focus.tokenId] = {
          ...record,
          lastFocusedRound: profile.round,
        };
      }
    }

    const recentTokenIds = [
      ...new Set(
        built.exercise.entries.flatMap((entry) => [...entryTokenSet(entry)]),
      ),
    ];
    profile = {
      ...profile,
      round: profile.round + 1,
      bindings,
      recentEntryIds: built.exercise.entries.map((entry) => entry.id),
      recentTokenIds,
    };
  }

  const serializedRounds = JSON.stringify(rounds);
  let digest = 2166136261;
  for (let index = 0; index < serializedRounds.length; index += 1) {
    digest ^= serializedRounds.charCodeAt(index);
    digest = Math.imul(digest, 16777619);
  }
  return {
    scenario: scenario.name,
    seed: scenario.seed,
    policyVersion: policy.version,
    rounds,
    determinismDigest: (digest >>> 0).toString(16).padStart(8, "0"),
  };
}

export function profileFromAggregates(
  support: CatalogSupportIndex,
  mode: CurriculumProfile["mode"],
  layoutId: string,
  aggregates: readonly BindingAggregate[],
  round = 0,
): CurriculumProfile {
  const profile = createEmptyCurriculumProfile(support, mode, layoutId);
  const bindings: Record<string, CurriculumBindingRecord> = { ...profile.bindings };
  for (const aggregate of aggregates) {
    if (aggregate.scope.mode !== mode || aggregate.scope.layoutId !== layoutId) continue;
    const record = bindings[aggregate.scope.tokenId];
    if (record !== undefined) {
      bindings[aggregate.scope.tokenId] = { ...record, aggregate };
    }
  }
  return { ...profile, round, bindings };
}

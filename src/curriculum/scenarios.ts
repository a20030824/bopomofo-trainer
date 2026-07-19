import type { BindingAggregate } from "../measurement/types.js";
import {
  createEmptyCurriculumProfile,
  profileFromAggregates,
} from "./simulator.js";
import type {
  SimulationScenario,
  SyntheticPerformance,
} from "./simulator.js";
import type {
  CatalogSupportIndex,
  CurriculumBindingRecord,
  CurriculumPolicy,
  CurriculumProfile,
} from "./types.js";

function codeUnitCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function aggregateFor(
  profile: CurriculumProfile,
  tokenId: string,
  timingMs: number,
  errorRate: number,
  attempts = 12,
): BindingAggregate {
  const record = profile.bindings[tokenId];
  if (record === undefined) throw new Error(`unknown scenario token: ${tokenId}`);
  return {
    scope: record.scope,
    attempts,
    errors: Math.round(attempts * errorRate),
    timingSamples: attempts,
    currentTimeToTypeMs: timingMs,
    bestTimeToTypeMs: Math.max(1, timingMs * 0.8),
    timingExclusions: {
      syllableStart: 0,
      incorrect: 0,
      recovery: 0,
      interactionNoise: 0,
    },
  };
}

function baselineAggregates(profile: CurriculumProfile): BindingAggregate[] {
  return Object.keys(profile.bindings)
    .sort(codeUnitCompare)
    .map((tokenId) => aggregateFor(profile, tokenId, 180, 0.03));
}

function performanceMap(
  tokenIds: readonly string[],
  overrides: Readonly<Record<string, SyntheticPerformance>> = {},
): Record<string, SyntheticPerformance> {
  const result: Record<string, SyntheticPerformance> = {};
  for (const tokenId of tokenIds) {
    result[tokenId] = overrides[tokenId] ?? { timingMs: 180, errorRate: 0.03 };
  }
  return result;
}

function commonTokens(
  support: CatalogSupportIndex,
  minimumCatalogEntries: number,
): string[] {
  return Object.values(support.byToken)
    .filter((item) => item.entryCount >= minimumCatalogEntries)
    .sort(
      (left, right) => right.entryCount - left.entryCount
        || codeUnitCompare(left.tokenId, right.tokenId),
    )
    .map((item) => item.tokenId);
}

function rareTokens(
  support: CatalogSupportIndex,
  minimumCatalogEntries: number,
): string[] {
  return Object.values(support.byToken)
    .filter((item) => item.entryCount < minimumCatalogEntries)
    .sort(
      (left, right) => left.entryCount - right.entryCount
        || codeUnitCompare(left.tokenId, right.tokenId),
    )
    .map((item) => item.tokenId);
}

export function createStandardSimulationScenarios(
  support: CatalogSupportIndex,
  policy: CurriculumPolicy,
  seed: string,
  rounds: number,
): readonly SimulationScenario[] {
  const empty = createEmptyCurriculumProfile(
    support,
    "guided",
    "zhuyin-standard",
  );
  const tokenIds = Object.keys(support.byToken).sort(codeUnitCompare);
  const common = commonTokens(support, policy.minimumCatalogEntries);
  const rare = rareTokens(support, policy.minimumCatalogEntries);
  const primary = common[0];
  const secondary = common[1] ?? primary;
  if (primary === undefined) {
    throw new Error(
      "curriculum scenarios require a token that meets the catalog-support policy",
    );
  }

  const baseline = baselineAggregates(empty);
  const weakPrimary = baseline.map((aggregate) =>
    aggregate.scope.tokenId === primary
      ? aggregateFor(empty, primary, 420, 0.35)
      : aggregate,
  );
  const competing = baseline.map((aggregate) => {
    if (aggregate.scope.tokenId === primary) {
      return aggregateFor(empty, primary, 360, 0.25);
    }
    if (aggregate.scope.tokenId === secondary) {
      return aggregateFor(empty, secondary, 350, 0.26);
    }
    return aggregate;
  });

  const rareToken = rare[0];
  const rareWeak = rareToken === undefined
    ? baseline
    : baseline.map((aggregate) =>
        aggregate.scope.tokenId === rareToken
          ? aggregateFor(empty, rareToken, 600, 0.5)
          : aggregate,
      );

  const cooldownBase = profileFromAggregates(
    support,
    "guided",
    "zhuyin-standard",
    weakPrimary,
    10,
  );
  const cooldownRecord = cooldownBase.bindings[primary]!;
  const cooldownBindings: Record<string, CurriculumBindingRecord> = {
    ...cooldownBase.bindings,
    [primary]: { ...cooldownRecord, lastFocusedRound: 9 },
  };

  return [
    {
      name: "new-learner",
      seed: `${seed}:new`,
      rounds,
      profile: empty,
      performance: performanceMap(tokenIds),
    },
    {
      name: "weak-common-binding",
      seed: `${seed}:weak-common`,
      rounds,
      profile: profileFromAggregates(
        support,
        "guided",
        "zhuyin-standard",
        weakPrimary,
      ),
      performance: performanceMap(tokenIds, {
        [primary]: { timingMs: 420, errorRate: 0.35 },
      }),
    },
    {
      name: "rare-unsupported-binding",
      seed: `${seed}:rare`,
      rounds,
      profile: profileFromAggregates(
        support,
        "guided",
        "zhuyin-standard",
        rareWeak,
      ),
      performance: performanceMap(
        tokenIds,
        rareToken === undefined
          ? {}
          : { [rareToken]: { timingMs: 600, errorRate: 0.5 } },
      ),
    },
    {
      name: "competing-weak-bindings",
      seed: `${seed}:competing`,
      rounds,
      profile: profileFromAggregates(
        support,
        "guided",
        "zhuyin-standard",
        competing,
      ),
      performance: performanceMap(tokenIds, {
        [primary]: { timingMs: 360, errorRate: 0.25 },
        ...(secondary === undefined
          ? {}
          : { [secondary]: { timingMs: 350, errorRate: 0.26 } }),
      }),
    },
    {
      name: "cooldown-prevents-refocus",
      seed: `${seed}:cooldown`,
      rounds,
      profile: { ...cooldownBase, bindings: cooldownBindings },
      performance: performanceMap(tokenIds, {
        [primary]: { timingMs: 420, errorRate: 0.35 },
      }),
    },
  ];
}

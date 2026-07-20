import type { RelationalExperimentMetrics, RelationalExperimentRoundRecord } from "./types.js";
import type { SyntheticLearnerState } from "../learner/types.js";

function metric(value: number | null, reason: string) {
  return { value, reason } as const;
}

function mean(values: readonly number[]): number | null {
  return values.length === 0
    ? null
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function meanEstimationError(
  rounds: readonly RelationalExperimentRoundRecord[],
  kind: "binding" | "transition" | "confusion",
): number | null {
  const values = rounds.flatMap((round) => {
    const value = round.cumulativeEstimationError.meanAbsoluteErrorByKind[kind] ?? null;
    return value === null ? [] : [value];
  });
  return mean(values);
}

function weaknessDelay(
  rounds: readonly RelationalExperimentRoundRecord[],
  hiddenWeaknessRelationKeys: ReadonlySet<string>,
): number | null {
  const found = rounds.find((round) =>
    round.objectiveRelationKeys.some((key) => hiddenWeaknessRelationKeys.has(key))
  );
  return found?.round ?? null;
}

function exposureAndTokens(rounds: readonly RelationalExperimentRoundRecord[]) {
  let exposures = 0;
  let tokens = 0;
  for (const round of rounds) {
    exposures += round.sequence?.targetExposureCount ?? 0;
    tokens += round.sequence?.tokenCount ?? 0;
  }
  return { exposures, tokens };
}

function lexicalStats(rounds: readonly RelationalExperimentRoundRecord[]) {
  const counts = new Map<string, number>();
  let total = 0;
  for (const round of rounds) {
    for (const item of round.sequence?.items ?? []) {
      counts.set(item.entry.id, (counts.get(item.entry.id) ?? 0) + 1);
      total += 1;
    }
  }
  const maximum = Math.max(0, ...counts.values());
  const repeated = [...counts.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0);
  return {
    total,
    concentration: total === 0 ? null : maximum / total,
    repeatedRate: total === 0 ? null : repeated / total,
  };
}

function normalizedLatentImprovement(rounds: readonly RelationalExperimentRoundRecord[]): number {
  let total = 0;
  for (const round of rounds) {
    for (const event of round.learnerBatch?.exposureUpdate.events ?? []) {
      const improvement = event.relationKind === "transition"
        ? Math.max(0, event.before - event.after) / Math.max(1, Math.abs(event.before))
        : Math.max(0, event.before - event.after);
      total += improvement;
    }
  }
  return total;
}

function heldOutTransfer(rounds: readonly RelationalExperimentRoundRecord[]): number | null {
  const values = rounds.flatMap((round) =>
    (round.learnerBatch?.exposureUpdate.events ?? [])
      .filter((event) => event.reason === "explicit-transition-transfer")
      .map((event) => Math.max(0, event.before - event.after) / Math.max(1, event.before))
  );
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0);
}

function confusionTotal(state: SyntheticLearnerState): number {
  return Object.values(state.confusions)
    .reduce((sum, truth) => sum + truth.conditionalProbability, 0);
}

export function calculateRelationalExperimentMetrics(
  rounds: readonly RelationalExperimentRoundRecord[],
  hiddenWeaknessRelationKeys: readonly string[],
  supportedRelationCount: number,
  initialLearner: SyntheticLearnerState,
  finalLearner: SyntheticLearnerState,
): RelationalExperimentMetrics {
  const hidden = new Set(hiddenWeaknessRelationKeys);
  const delay = weaknessDelay(rounds, hidden);
  const { exposures, tokens } = exposureAndTokens(rounds);
  const selectedRelations = new Set(rounds.flatMap((round) => round.objectiveRelationKeys));
  const lexical = lexicalStats(rounds);
  const fallbacks = rounds.filter((round) =>
    round.objectiveDecision.fallbackReason !== null
    || (round.sequence?.fallbackReasons.length ?? 0) > 0
  ).length;
  const failures = rounds.filter((round) => round.failures.length > 0).length;
  const latentImprovement = normalizedLatentImprovement(rounds);
  const transfer = heldOutTransfer(rounds);
  const initialConfusion = confusionTotal(initialLearner);
  const finalConfusion = confusionTotal(finalLearner);

  const bindingError = meanEstimationError(rounds, "binding");
  const transitionError = meanEstimationError(rounds, "transition");
  const confusionError = meanEstimationError(rounds, "confusion");

  return {
    weaknessIdentificationDelayRounds: metric(
      delay,
      delay === null
        ? "hidden-weakness-relation-was-not-selected"
        : "first-round-selecting-a-maximal-initial-latent-weakness",
    ),
    bindingEstimateMeanAbsoluteError: metric(
      bindingError,
      bindingError === null ? "no-estimated-binding-component" : "mean-of-cumulative-phase-3-error-reports",
    ),
    transitionEstimateMeanAbsoluteErrorMs: metric(
      transitionError,
      transitionError === null ? "no-estimated-transition-component" : "mean-of-cumulative-phase-3-error-reports",
    ),
    confusionEstimateMeanAbsoluteError: metric(
      confusionError,
      confusionError === null ? "no-estimated-confusion-component" : "mean-of-cumulative-phase-3-error-reports",
    ),
    targetExposurePerToken: metric(
      tokens === 0 ? null : exposures / tokens,
      tokens === 0 ? "no-composed-token-cost" : "target-exposures-divided-by-practice-tokens",
    ),
    relationCoverage: metric(
      supportedRelationCount === 0 ? null : selectedRelations.size / supportedRelationCount,
      supportedRelationCount === 0 ? "no-supported-relation-universe" : "distinct-selected-relations-divided-by-supported-relations",
    ),
    heldOutTransferProxy: metric(
      transfer,
      transfer === null ? "learner-produced-no-explicit-transfer-event" : "normalized-latent-improvement-from-explicit-transfer-events",
    ),
    lexicalConcentration: metric(
      lexical.concentration,
      lexical.total === 0 ? "no-selected-entry" : "maximum-entry-use-share",
    ),
    repeatedEntryRate: metric(
      lexical.repeatedRate,
      lexical.total === 0 ? "no-selected-entry" : "entry-uses-beyond-first-divided-by-total-uses",
    ),
    fallbackRate: metric(
      rounds.length === 0 ? null : fallbacks / rounds.length,
      rounds.length === 0 ? "no-rounds" : "rounds-with-objective-or-composition-fallback",
    ),
    failureRate: metric(
      rounds.length === 0 ? null : failures / rounds.length,
      rounds.length === 0 ? "no-rounds" : "rounds-with-recorded-stage-failure",
    ),
    costPerLatentImprovement: metric(
      latentImprovement === 0 ? null : tokens / latentImprovement,
      latentImprovement === 0 ? "no-positive-normalized-latent-improvement" : "practice-tokens-per-normalized-latent-improvement",
    ),
    confusionReduction: metric(
      initialConfusion === 0 ? null : initialConfusion - finalConfusion,
      initialConfusion === 0 ? "scenario-declares-no-confusion-truth" : "initial-minus-final-total-conditional-confusion-probability",
    ),
  };
}

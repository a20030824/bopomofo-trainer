import type {
  RelationalExperimentRoundRecord,
  RelationalExperimentRunRecord,
} from "../experiment/types.js";
import type { RelationalAnalysisPolicy } from "./types.js";

export function roundHasAnyFallback(
  round: RelationalExperimentRoundRecord,
): boolean {
  return round.objectiveDecision.fallbackReason !== null
    || (round.sequence?.fallbackReasons.length ?? 0) > 0;
}

export function roundHasBlockingFallback(
  round: RelationalExperimentRoundRecord,
  policy: RelationalAnalysisPolicy,
): boolean {
  if ((round.sequence?.fallbackReasons.length ?? 0) > 0) return true;
  const objectiveCode = round.objectiveDecision.fallbackReason;
  return objectiveCode !== null
    && !policy.nonBlockingObjectiveFallbackCodes.includes(objectiveCode);
}

function rate(
  runs: readonly RelationalExperimentRunRecord[],
  predicate: (round: RelationalExperimentRoundRecord) => boolean,
): number {
  const rounds = runs.flatMap((run) => run.rounds);
  if (rounds.length === 0) return 0;
  return rounds.filter(predicate).length / rounds.length;
}

export function totalFallbackRate(
  runs: readonly RelationalExperimentRunRecord[],
): number {
  return rate(runs, roundHasAnyFallback);
}

export function blockingFallbackRate(
  runs: readonly RelationalExperimentRunRecord[],
  policy: RelationalAnalysisPolicy,
): number {
  return rate(runs, (round) => roundHasBlockingFallback(round, policy));
}

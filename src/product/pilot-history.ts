import type { TokenId } from "../core/model.js";
import { deriveMeasurementDecisions } from "../measurement/derive-observations.js";
import type { MeasurementPolicy } from "../measurement/types.js";
import type { InteractionTrace } from "../practice/interaction-session.js";
import type {
  ProductEnvironment,
  ProductProgress,
  ProductRound,
  ProductRoundSummary,
} from "./types.js";

export const PILOT_HISTORY_SCHEMA_VERSION = 2 as const;
export const PILOT_HISTORY_LIMIT = 24;

export interface PilotRoundRecord {
  readonly roundNumber: number;
  readonly kind: ProductRoundSummary["kind"];
  readonly exerciseId: string;
  readonly completedAt: string;
  readonly entryIds: readonly string[];
  readonly phase: ProductRoundSummary["phase"];
  readonly focusTokenId: TokenId | null;
  readonly focusEvidence: ProductRoundSummary["focusEvidence"];
  readonly attempts: number;
  readonly errors: number;
  readonly timingSamples: number;
  readonly cleanLatencyMedianMs: number | null;
}

export interface PilotHistory {
  readonly schemaVersion: typeof PILOT_HISTORY_SCHEMA_VERSION;
  readonly records: readonly PilotRoundRecord[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0;
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? null;
  const left = sorted[middle - 1];
  const right = sorted[middle];
  return left === undefined || right === undefined ? null : (left + right) / 2;
}

function recordFromSummary(
  summary: ProductRoundSummary,
  roundNumber: number,
): PilotRoundRecord {
  return {
    roundNumber,
    kind: summary.kind,
    exerciseId: summary.exerciseId,
    completedAt: summary.completedAt,
    entryIds: summary.entryIds,
    phase: summary.phase,
    focusTokenId: summary.focusTokenId,
    focusEvidence: summary.focusEvidence,
    attempts: summary.attempts,
    errors: summary.errors,
    timingSamples: summary.timingSamples,
    cleanLatencyMedianMs: null,
  };
}

export function createPilotRoundRecord(
  roundNumber: number,
  round: ProductRound,
  summary: ProductRoundSummary,
  traces: readonly InteractionTrace[],
  policy: MeasurementPolicy,
): PilotRoundRecord {
  if (!Number.isInteger(roundNumber) || roundNumber <= 0) {
    throw new RangeError("roundNumber must be a positive integer");
  }
  if (round.exercise.id !== summary.exerciseId || round.kind !== summary.kind) {
    throw new Error("round and summary do not describe the same completed exercise");
  }
  const cleanLatencies = deriveMeasurementDecisions(
    round.exercise,
    traces,
    policy,
  ).flatMap((decision) => {
    if (!decision.binding.included) return [];
    const timing = decision.binding.observation.timingMs;
    return timing === null ? [] : [timing];
  });
  if (cleanLatencies.length !== summary.timingSamples) {
    throw new Error("pilot latency sample count does not match the round summary");
  }
  return {
    ...recordFromSummary(summary, roundNumber),
    cleanLatencyMedianMs: median(cleanLatencies),
  };
}

export function migratePilotHistory(progress: ProductProgress): PilotHistory {
  const totalCompleted = progress.practiceRoundsCompleted
    + progress.evaluationRoundsCompleted;
  const records = progress.recentSummaries.map((summary, index) =>
    recordFromSummary(
      summary,
      totalCompleted - progress.recentSummaries.length + index + 1,
    ),
  ).filter((record) => record.roundNumber > 0);
  return {
    schemaVersion: PILOT_HISTORY_SCHEMA_VERSION,
    records: records.slice(-PILOT_HISTORY_LIMIT),
  };
}

export function appendPilotRoundRecord(
  history: PilotHistory,
  record: PilotRoundRecord,
): PilotHistory {
  const previous = history.records.at(-1);
  if (previous !== undefined && record.roundNumber <= previous.roundNumber) {
    throw new Error("pilot history round numbers must increase strictly");
  }
  return {
    schemaVersion: PILOT_HISTORY_SCHEMA_VERSION,
    records: [...history.records, record].slice(-PILOT_HISTORY_LIMIT),
  };
}

export function mergePilotHistories(
  preferred: PilotHistory,
  fallback: PilotHistory,
  completedRounds: number,
): PilotHistory {
  const byRound = new Map<number, PilotRoundRecord>();
  for (const record of fallback.records) {
    if (record.roundNumber <= completedRounds) byRound.set(record.roundNumber, record);
  }
  for (const record of preferred.records) {
    if (record.roundNumber <= completedRounds) byRound.set(record.roundNumber, record);
  }
  return {
    schemaVersion: PILOT_HISTORY_SCHEMA_VERSION,
    records: [...byRound.values()]
      .sort((left, right) => left.roundNumber - right.roundNumber)
      .slice(-PILOT_HISTORY_LIMIT),
  };
}

function parsePilotRoundRecord(
  value: unknown,
  environment: ProductEnvironment,
): PilotRoundRecord | null {
  if (!isRecord(value) || !Array.isArray(value.entryIds)) return null;
  const kind = value.kind;
  const phase = value.phase;
  const focusEvidence = value.focusEvidence;
  const latency = value.cleanLatencyMedianMs;
  if (
    !Number.isInteger(value.roundNumber)
    || (value.roundNumber as number) <= 0
    || (kind !== "practice" && kind !== "evaluation")
    || typeof value.exerciseId !== "string"
    || typeof value.completedAt !== "string"
    || Number.isNaN(Date.parse(value.completedAt))
    || value.entryIds.length === 0
    || value.entryIds.some((entryId) => typeof entryId !== "string")
    || new Set(value.entryIds).size !== value.entryIds.length
    || (phase !== "coverage" && phase !== "adaptive" && phase !== "evaluation")
    || (value.focusTokenId !== null && typeof value.focusTokenId !== "string")
    || (focusEvidence !== null
      && focusEvidence !== "timed"
      && focusEvidence !== "correctness-only")
    || !isNonNegativeInteger(value.attempts)
    || !isNonNegativeInteger(value.errors)
    || !isNonNegativeInteger(value.timingSamples)
    || (value.errors as number) > (value.attempts as number)
    || (value.timingSamples as number) > (value.attempts as number)
    || (latency !== null
      && (typeof latency !== "number" || !Number.isFinite(latency) || latency < 0))
  ) return null;

  const support = kind === "practice"
    ? environment.practiceSupport
    : environment.evaluationSupport;
  if (value.entryIds.some((entryId) => support.entriesById[entryId as string] === undefined)) {
    return null;
  }
  if (kind === "evaluation") {
    if (phase !== "evaluation" || value.focusTokenId !== null || focusEvidence !== null) {
      return null;
    }
  } else {
    if (phase === "evaluation") return null;
    if ((value.focusTokenId === null) !== (focusEvidence === null)) return null;
    if (
      typeof value.focusTokenId === "string"
      && environment.practiceSupport.byToken[value.focusTokenId] === undefined
    ) return null;
  }

  return {
    roundNumber: value.roundNumber as number,
    kind,
    exerciseId: value.exerciseId,
    completedAt: value.completedAt,
    entryIds: value.entryIds as string[],
    phase,
    focusTokenId: value.focusTokenId as TokenId | null,
    focusEvidence,
    attempts: value.attempts as number,
    errors: value.errors as number,
    timingSamples: value.timingSamples as number,
    cleanLatencyMedianMs: latency as number | null,
  };
}

export function parsePilotHistory(
  source: string,
  environment: ProductEnvironment,
): PilotHistory | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source) as unknown;
  } catch {
    return null;
  }
  if (
    !isRecord(parsed)
    || parsed.schemaVersion !== PILOT_HISTORY_SCHEMA_VERSION
    || !Array.isArray(parsed.records)
  ) return null;
  const records = parsed.records.map((value) => parsePilotRoundRecord(value, environment));
  if (records.some((record) => record === null)) return null;
  const valid = records as PilotRoundRecord[];
  if (valid.some((record, index) =>
    index > 0 && record.roundNumber <= valid[index - 1]!.roundNumber
  )) return null;
  return {
    schemaVersion: PILOT_HISTORY_SCHEMA_VERSION,
    records: valid.slice(-PILOT_HISTORY_LIMIT),
  };
}

export function serializePilotHistory(history: PilotHistory): string {
  return JSON.stringify(history);
}

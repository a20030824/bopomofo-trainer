import {
  FREQUENCY_FIRST_UTTERANCE_POLICY,
  type FrequencyFirstUtterancePolicy,
} from "../curriculum/frequency-first-utterance.js";
import type { StorageLike } from "./local-progress.js";

export const LOCAL_SELECTION_TUNING_KEY = "bopomofo-trainer.selection-tuning.v1";

export interface SelectionTuning {
  readonly errorInfluence: number;
  readonly timingInfluence: number;
}

export const DEFAULT_SELECTION_TUNING: SelectionTuning = {
  errorInfluence: 1,
  timingInfluence: 1,
};

function validInfluence(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 2;
}

export function parseSelectionTuning(source: string): SelectionTuning | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source) as unknown;
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
  const candidate = parsed as Record<string, unknown>;
  if (!validInfluence(candidate.errorInfluence)
    || !validInfluence(candidate.timingInfluence)) return null;
  return {
    errorInfluence: candidate.errorInfluence,
    timingInfluence: candidate.timingInfluence,
  };
}

export function loadSelectionTuning(storage: StorageLike): SelectionTuning {
  const source = storage.getItem(LOCAL_SELECTION_TUNING_KEY);
  return source === null
    ? DEFAULT_SELECTION_TUNING
    : parseSelectionTuning(source) ?? DEFAULT_SELECTION_TUNING;
}

export function saveSelectionTuning(
  storage: StorageLike,
  tuning: SelectionTuning,
): void {
  storage.setItem(LOCAL_SELECTION_TUNING_KEY, JSON.stringify(tuning));
}

export function policyForSelectionTuning(
  tuning: SelectionTuning,
): FrequencyFirstUtterancePolicy {
  if (!validInfluence(tuning.errorInfluence)
    || !validInfluence(tuning.timingInfluence)) {
    throw new RangeError("selection tuning influences must be between 0 and 2");
  }
  return {
    ...FREQUENCY_FIRST_UTTERANCE_POLICY,
    errorBoostScale:
      FREQUENCY_FIRST_UTTERANCE_POLICY.errorBoostScale * tuning.errorInfluence,
    timingBoostScale:
      FREQUENCY_FIRST_UTTERANCE_POLICY.timingBoostScale * tuning.timingInfluence,
    transitionBoostScale:
      FREQUENCY_FIRST_UTTERANCE_POLICY.transitionBoostScale * tuning.timingInfluence,
  };
}

import {
  mergePilotHistories,
  migratePilotHistory,
  parsePilotHistory,
  serializePilotHistory,
  type PilotHistory,
} from "../product/pilot-history.js";
import type { ProductEnvironment, ProductProgress } from "../product/types.js";
import type { StorageLike } from "./local-progress.js";

export const LOCAL_PILOT_HISTORY_KEY = "bopomofo-trainer.pilot-history.v2";
export const OBSOLETE_LOCAL_PILOT_HISTORY_KEYS = [
  "bopomofo-trainer.pilot-history.v1",
] as const;

export interface LocalPilotHistoryLoadResult {
  readonly history: PilotHistory;
  readonly recoveredFromInvalidState: boolean;
}

function clearObsoleteLocalPilotHistory(storage: StorageLike): boolean {
  let removed = false;
  for (const key of OBSOLETE_LOCAL_PILOT_HISTORY_KEYS) {
    if (storage.getItem(key) !== null) removed = true;
    storage.removeItem(key);
  }
  return removed;
}

export function loadLocalPilotHistory(
  storage: StorageLike,
  progress: ProductProgress,
  environment: ProductEnvironment,
): LocalPilotHistoryLoadResult {
  const migrated = migratePilotHistory(progress);
  const discardedObsoleteState = clearObsoleteLocalPilotHistory(storage);
  const source = storage.getItem(LOCAL_PILOT_HISTORY_KEY);
  if (source === null) {
    return {
      history: migrated,
      recoveredFromInvalidState: discardedObsoleteState,
    };
  }
  const parsed = parsePilotHistory(source, environment);
  if (parsed === null) {
    return { history: migrated, recoveredFromInvalidState: true };
  }
  const completedRounds = progress.practiceRoundsCompleted
    + progress.evaluationRoundsCompleted;
  return {
    history: mergePilotHistories(parsed, migrated, completedRounds),
    recoveredFromInvalidState: false,
  };
}

export function saveLocalPilotHistory(
  storage: StorageLike,
  history: PilotHistory,
): void {
  storage.setItem(LOCAL_PILOT_HISTORY_KEY, serializePilotHistory(history));
}

export function clearLocalPilotHistory(storage: StorageLike): void {
  storage.removeItem(LOCAL_PILOT_HISTORY_KEY);
  clearObsoleteLocalPilotHistory(storage);
}

import {
  parsePilotHistory,
  serializePilotHistory,
  type PilotHistory,
} from "../product/pilot-history.js";
import {
  parseProductProgress,
  serializeProductProgress,
} from "../product/progress.js";
import type {
  ProductEnvironment,
  ProductProgress,
} from "../product/types.js";
import {
  parseSelectionTuning,
  type SelectionTuning,
} from "./selection-tuning.js";

export const PRODUCT_BACKUP_VERSION = 1 as const;

export interface ProductBackup {
  readonly backupVersion: typeof PRODUCT_BACKUP_VERSION;
  readonly exportedAt: string;
  readonly progress: ProductProgress;
  readonly pilotHistory: PilotHistory;
  readonly selectionTuning: SelectionTuning;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function createProductBackup(
  progress: ProductProgress,
  pilotHistory: PilotHistory,
  selectionTuning: SelectionTuning,
  exportedAt = new Date().toISOString(),
): string {
  return `${JSON.stringify({
    backupVersion: PRODUCT_BACKUP_VERSION,
    exportedAt,
    progress: JSON.parse(serializeProductProgress(progress)) as unknown,
    pilotHistory: JSON.parse(serializePilotHistory(pilotHistory)) as unknown,
    selectionTuning,
  }, null, 2)}\n`;
}

export function parseProductBackup(
  source: string,
  environment: ProductEnvironment,
  mode: ProductProgress["mode"],
  layoutId: string,
): ProductBackup | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source) as unknown;
  } catch {
    return null;
  }
  if (!isRecord(parsed)
    || parsed.backupVersion !== PRODUCT_BACKUP_VERSION
    || typeof parsed.exportedAt !== "string"
    || !isRecord(parsed.progress)
    || !isRecord(parsed.pilotHistory)
    || !isRecord(parsed.selectionTuning)) return null;

  const progress = parseProductProgress(
    JSON.stringify(parsed.progress),
    environment.practiceSupport,
    mode,
    layoutId,
    environment.measurementPolicy,
    environment.curriculumPolicy.version,
    environment.utterancePolicy,
  );
  const pilotHistory = parsePilotHistory(
    JSON.stringify(parsed.pilotHistory),
    environment,
  );
  const selectionTuning = parseSelectionTuning(JSON.stringify(parsed.selectionTuning));
  if (progress === null || pilotHistory === null || selectionTuning === null) return null;
  const completedRounds = progress.practiceRoundsCompleted
    + progress.evaluationRoundsCompleted;
  if (pilotHistory.records.some((record) => record.roundNumber > completedRounds)) {
    return null;
  }
  return {
    backupVersion: PRODUCT_BACKUP_VERSION,
    exportedAt: parsed.exportedAt,
    progress,
    pilotHistory,
    selectionTuning,
  };
}

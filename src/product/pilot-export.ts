import type { ProductEnvironment, ProductProgress } from "./types.js";
import {
  PILOT_HISTORY_SCHEMA_VERSION,
  type PilotHistory,
} from "./pilot-history.js";

export const PILOT_EXPORT_VERSION = 1 as const;

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function createPilotExport(
  environment: ProductEnvironment,
  progress: ProductProgress,
  history: PilotHistory,
): string {
  const cooldown = Object.entries(progress.curriculum.bindings)
    .map(([tokenId, record]) => ({
      tokenId,
      lastFocusedRound: record.lastFocusedRound,
    }))
    .sort((left, right) => compareText(left.tokenId, right.tokenId));
  const payload = {
    exportVersion: PILOT_EXPORT_VERSION,
    productSchemaVersion: progress.schemaVersion,
    pilotHistorySchemaVersion: PILOT_HISTORY_SCHEMA_VERSION,
    measurementPolicyVersion: environment.measurementPolicy.version,
    curriculumPolicyVersion: environment.curriculumPolicy.version,
    scope: {
      mode: progress.mode,
      layoutId: progress.layoutId,
    },
    completedRounds: {
      practice: progress.practiceRoundsCompleted,
      evaluation: progress.evaluationRoundsCompleted,
    },
    history: history.records,
    curriculum: {
      round: progress.curriculum.round,
      cooldown,
      recentEntryIds: progress.curriculum.recentEntryIds,
      recentTokenIds: progress.curriculum.recentTokenIds,
    },
    measurements: progress.measurements,
    catalogPartition: {
      practiceEntryIds: environment.catalogs.practice
        .map((entry) => entry.id)
        .sort(compareText),
      evaluationEntryIds: environment.catalogs.evaluation
        .map((entry) => entry.id)
        .sort(compareText),
    },
  };
  return JSON.stringify(payload, null, 2);
}

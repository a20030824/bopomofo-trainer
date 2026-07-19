import { parseProductProgress, serializeProductProgress } from "../product/progress.js";
import type { ProductEnvironment, ProductProgress } from "../product/types.js";

export const LOCAL_PROGRESS_KEY = "bopomofo-trainer.progress.v1";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface LocalProgressLoadResult {
  readonly progress: ProductProgress | null;
  readonly recoveredFromInvalidState: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function summaryReferencesAreKnown(
  source: string,
  environment: ProductEnvironment,
): boolean {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source) as unknown;
  } catch {
    return true;
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.recentSummaries)) return true;
  const knownEntries = new Set([
    ...Object.keys(environment.practiceSupport.entriesById),
    ...Object.keys(environment.evaluationSupport.entriesById),
  ]);
  const knownFocusTokens = new Set(Object.keys(environment.practiceSupport.byToken));
  return parsed.recentSummaries.every((summary) => {
    if (!isRecord(summary) || !Array.isArray(summary.entryIds)) return false;
    if (summary.entryIds.length === 0) return false;
    if (summary.entryIds.some((entryId) =>
      typeof entryId !== "string" || !knownEntries.has(entryId)
    )) return false;
    if (new Set(summary.entryIds).size !== summary.entryIds.length) return false;
    return summary.focusTokenId === null
      || (typeof summary.focusTokenId === "string"
        && knownFocusTokens.has(summary.focusTokenId));
  });
}

export function loadLocalProductProgress(
  storage: StorageLike,
  environment: ProductEnvironment,
  mode: ProductProgress["mode"],
  layoutId: string,
): LocalProgressLoadResult {
  const source = storage.getItem(LOCAL_PROGRESS_KEY);
  if (source === null) {
    return { progress: null, recoveredFromInvalidState: false };
  }
  if (!summaryReferencesAreKnown(source, environment)) {
    return { progress: null, recoveredFromInvalidState: true };
  }
  const progress = parseProductProgress(
    source,
    environment.practiceSupport,
    mode,
    layoutId,
    environment.measurementPolicy,
    environment.curriculumPolicy.version,
  );
  return {
    progress,
    recoveredFromInvalidState: progress === null,
  };
}

export function saveLocalProductProgress(
  storage: StorageLike,
  progress: ProductProgress,
): void {
  storage.setItem(LOCAL_PROGRESS_KEY, serializeProductProgress(progress));
}

export function clearLocalProductProgress(storage: StorageLike): void {
  storage.removeItem(LOCAL_PROGRESS_KEY);
}

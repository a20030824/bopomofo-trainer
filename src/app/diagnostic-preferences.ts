import type {
  ConfusionDirection,
  KeyDiagnosticSort,
  TransitionDirection,
} from "../diagnostics/selectors.js";

export type DiagnosticTab = "key" | "transition" | "confusion";
export const DIAGNOSTIC_MINIMUM_SAMPLE_OPTIONS = [1, 3, 5, 8] as const;
export type DiagnosticMinimumSamples = typeof DIAGNOSTIC_MINIMUM_SAMPLE_OPTIONS[number];

export interface DiagnosticPreferences {
  readonly expanded: boolean;
  readonly activeTab: DiagnosticTab;
  readonly keySort: KeyDiagnosticSort;
  readonly transitionDirection: TransitionDirection;
  readonly confusionDirection: ConfusionDirection;
  readonly minimumSamples: number;
  readonly includeTone: boolean;
}

export interface DiagnosticPreferenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const DIAGNOSTIC_PREFERENCES_KEY = "bopomofo-trainer.diagnostics.v1";

export const DEFAULT_DIAGNOSTIC_PREFERENCES: DiagnosticPreferences = {
  expanded: true,
  activeTab: "key",
  keySort: "error-ratio",
  transitionDirection: "both",
  confusionDirection: "both",
  minimumSamples: 5,
  includeTone: true,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTab(value: unknown): value is DiagnosticTab {
  return value === "key" || value === "transition" || value === "confusion";
}

function isKeySort(value: unknown): value is KeyDiagnosticSort {
  return value === "error-ratio" || value === "timing";
}

function isTransitionDirection(value: unknown): value is TransitionDirection {
  return value === "incoming" || value === "outgoing" || value === "both";
}

function isConfusionDirection(value: unknown): value is ConfusionDirection {
  return value === "expected" || value === "actual" || value === "both";
}

function isMinimumSamples(value: unknown): value is DiagnosticMinimumSamples {
  return typeof value === "number"
    && DIAGNOSTIC_MINIMUM_SAMPLE_OPTIONS.some((option) => option === value);
}

export function parseDiagnosticPreferences(source: string): DiagnosticPreferences | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source) as unknown;
  } catch {
    return null;
  }
  if (
    !isRecord(parsed)
    || typeof parsed.expanded !== "boolean"
    || !isTab(parsed.activeTab)
    || !isKeySort(parsed.keySort)
    || !isTransitionDirection(parsed.transitionDirection)
    || !isConfusionDirection(parsed.confusionDirection)
    || !isMinimumSamples(parsed.minimumSamples)
    || typeof parsed.includeTone !== "boolean"
  ) return null;
  return {
    expanded: parsed.expanded,
    activeTab: parsed.activeTab,
    keySort: parsed.keySort,
    transitionDirection: parsed.transitionDirection,
    confusionDirection: parsed.confusionDirection,
    minimumSamples: parsed.minimumSamples,
    includeTone: parsed.includeTone,
  };
}

export function loadDiagnosticPreferences(
  storage: DiagnosticPreferenceStorage,
): DiagnosticPreferences {
  const source = storage.getItem(DIAGNOSTIC_PREFERENCES_KEY);
  if (source === null) return DEFAULT_DIAGNOSTIC_PREFERENCES;
  return parseDiagnosticPreferences(source) ?? DEFAULT_DIAGNOSTIC_PREFERENCES;
}

export function saveDiagnosticPreferences(
  storage: DiagnosticPreferenceStorage,
  preferences: DiagnosticPreferences,
): void {
  storage.setItem(DIAGNOSTIC_PREFERENCES_KEY, JSON.stringify(preferences));
}

import { describe, expect, it } from "vitest";
import {
  DEFAULT_DIAGNOSTIC_PREFERENCES,
  DIAGNOSTIC_PREFERENCES_KEY,
  loadDiagnosticPreferences,
  parseDiagnosticPreferences,
  saveDiagnosticPreferences,
  type DiagnosticPreferenceStorage,
} from "../../src/app/diagnostic-preferences.js";

class MemoryStorage implements DiagnosticPreferenceStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe("diagnostic preferences", () => {
  it("round-trips validated preferences", () => {
    const storage = new MemoryStorage();
    const preferences = {
      ...DEFAULT_DIAGNOSTIC_PREFERENCES,
      expanded: false,
      activeTab: "transition" as const,
      minimumSamples: 8,
      includeTone: false,
    };
    saveDiagnosticPreferences(storage, preferences);
    expect(loadDiagnosticPreferences(storage)).toEqual(preferences);
    expect(storage.getItem(DIAGNOSTIC_PREFERENCES_KEY)).not.toBeNull();
  });

  it("falls back when stored fields are malformed or non-finite", () => {
    expect(parseDiagnosticPreferences(JSON.stringify({
      ...DEFAULT_DIAGNOSTIC_PREFERENCES,
      minimumSamples: -1,
    }))).toBeNull();
    expect(parseDiagnosticPreferences(JSON.stringify({
      ...DEFAULT_DIAGNOSTIC_PREFERENCES,
      minimumSamples: Number.NaN,
    }))).toBeNull();
    expect(parseDiagnosticPreferences(JSON.stringify({
      ...DEFAULT_DIAGNOSTIC_PREFERENCES,
      activeTab: "unknown",
    }))).toBeNull();

    const storage = new MemoryStorage();
    storage.setItem(DIAGNOSTIC_PREFERENCES_KEY, "not-json");
    expect(loadDiagnosticPreferences(storage)).toEqual(DEFAULT_DIAGNOSTIC_PREFERENCES);
  });
});

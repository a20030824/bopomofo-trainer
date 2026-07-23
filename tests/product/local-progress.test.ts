import { describe, expect, it } from "vitest";
import {
  clearLocalProductProgress,
  loadLocalProductProgress,
  LOCAL_PROGRESS_KEY,
  OBSOLETE_LOCAL_PROGRESS_KEYS,
  saveLocalProductProgress,
  type StorageLike,
} from "../../src/app/local-progress.js";
import {
  createFreshProgressForEnvironment,
  createProductEnvironment,
} from "../../src/product/session.js";
import { PRODUCT_CATALOGS } from "./fixtures.js";

class MemoryStorage implements StorageLike {
  private readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
}

const environment = createProductEnvironment(PRODUCT_CATALOGS);

describe("local progress adapter", () => {
  it("saves, restores, and clears canonical progress", () => {
    const storage = new MemoryStorage();
    const progress = createFreshProgressForEnvironment(
      environment,
      "seed",
      "guided",
      "standard",
    );
    saveLocalProductProgress(storage, progress);
    expect(loadLocalProductProgress(storage, environment, "guided", "standard")).toEqual({
      progress,
      recoveredFromInvalidState: false,
    });
    clearLocalProductProgress(storage);
    expect(storage.getItem(LOCAL_PROGRESS_KEY)).toBeNull();
  });

  it("deletes obsolete storage generations instead of migrating them", () => {
    const storage = new MemoryStorage();
    const obsoleteKey = OBSOLETE_LOCAL_PROGRESS_KEYS[0]!;
    storage.setItem(obsoleteKey, JSON.stringify({ schemaVersion: 2 }));
    expect(loadLocalProductProgress(storage, environment, "guided", "standard")).toEqual({
      progress: null,
      recoveredFromInvalidState: true,
    });
    expect(storage.getItem(obsoleteKey)).toBeNull();
    expect(storage.getItem(LOCAL_PROGRESS_KEY)).toBeNull();
  });

  it("rejects summaries that reference unknown entries", () => {
    const storage = new MemoryStorage();
    const progress = createFreshProgressForEnvironment(
      environment,
      "seed",
      "guided",
      "standard",
    );
    const stored = JSON.parse(JSON.stringify(progress)) as Record<string, unknown>;
    stored.recentSummaries = [{
      kind: "practice",
      exerciseId: "practice-1",
      completedAt: "2026-07-20T00:00:00.000Z",
      entryIds: ["unknown"],
      utteranceId: "utterance:unknown",
      templateId: null,
      frequencyStage: 1,
      phase: "coverage",
      focusTokenId: null,
      focusEvidence: null,
      attempts: 1,
      errors: 0,
      timingSamples: 0,
    }];
    storage.setItem(LOCAL_PROGRESS_KEY, JSON.stringify(stored));
    expect(loadLocalProductProgress(storage, environment, "guided", "standard")).toEqual({
      progress: null,
      recoveredFromInvalidState: true,
    });
  });

  it("reports invalid stored state without partially loading it", () => {
    const storage = new MemoryStorage();
    storage.setItem(LOCAL_PROGRESS_KEY, "{broken");
    expect(loadLocalProductProgress(storage, environment, "guided", "standard")).toEqual({
      progress: null,
      recoveredFromInvalidState: true,
    });
  });
});

import { describe, expect, it } from "vitest";
import {
  clearLocalProductProgress,
  loadLocalProductProgress,
  LOCAL_PROGRESS_KEY,
  saveLocalProductProgress,
  type StorageLike,
} from "../../src/app/local-progress.js";
import {
  createFreshProgressForEnvironment,
  createProductEnvironment,
} from "../../src/product/session.js";
import { EVALUATION, PRACTICE } from "./fixtures.js";

class MemoryStorage implements StorageLike {
  private readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
}

const environment = createProductEnvironment({ practice: PRACTICE, evaluation: EVALUATION });

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

  it("reports invalid stored state without partially loading it", () => {
    const storage = new MemoryStorage();
    storage.setItem(LOCAL_PROGRESS_KEY, "{broken");
    expect(loadLocalProductProgress(storage, environment, "guided", "standard")).toEqual({
      progress: null,
      recoveredFromInvalidState: true,
    });
  });
});

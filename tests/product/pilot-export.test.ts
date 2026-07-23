import { describe, expect, it } from "vitest";
import {
  loadLocalPilotHistory,
  LOCAL_PILOT_HISTORY_KEY,
  OBSOLETE_LOCAL_PILOT_HISTORY_KEYS,
  saveLocalPilotHistory,
} from "../../src/app/pilot-history.js";
import type { StorageLike } from "../../src/app/local-progress.js";
import { createPilotExport } from "../../src/product/pilot-export.js";
import {
  migratePilotHistory,
  PILOT_HISTORY_SCHEMA_VERSION,
  type PilotHistory,
  type PilotRoundRecord,
} from "../../src/product/pilot-history.js";
import {
  createFreshProgressForEnvironment,
  createProductEnvironment,
} from "../../src/product/session.js";
import type { ProductProgress, ProductRoundSummary } from "../../src/product/types.js";
import { PRACTICE, PRODUCT_CATALOGS } from "./fixtures.js";

class MemoryStorage implements StorageLike {
  private readonly values = new Map<string, string>();
  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
  removeItem(key: string): void {
    this.values.delete(key);
  }
}

const environment = createProductEnvironment(PRODUCT_CATALOGS);

function summary(round: number): ProductRoundSummary {
  return {
    kind: "practice",
    exerciseId: `practice-${round}`,
    completedAt: `2026-07-20T00:${String(round).padStart(2, "0")}:00.000Z`,
    entryIds: PRACTICE.slice(0, 1).map((entry) => entry.id),
    utteranceId: `utterance:${round}`,
    templateId: null,
    frequencyStage: 1,
    phase: "coverage",
    focusTokenId: null,
    focusEvidence: null,
    attempts: 10,
    errors: round % 2,
    timingSamples: 4,
  };
}

function progressWithSummaries(count: number): ProductProgress {
  const fresh = createFreshProgressForEnvironment(
    environment,
    "pilot-export-seed",
    "guided",
    "standard",
  );
  return {
    ...fresh,
    practiceRoundsCompleted: count,
    curriculum: { ...fresh.curriculum, round: count },
    recentSummaries: Array.from({ length: count }, (_, index) => summary(index + 1)),
  };
}

function withLatency(record: PilotRoundRecord, latency: number): PilotRoundRecord {
  return { ...record, cleanLatencyMedianMs: latency };
}

describe("local pilot history and export", () => {
  it("derives current progress when the pilot key is absent", () => {
    const storage = new MemoryStorage();
    const progress = progressWithSummaries(3);
    const loaded = loadLocalPilotHistory(storage, progress, environment);
    expect(loaded.recoveredFromInvalidState).toBe(false);
    expect(loaded.history.records.map((record) => record.roundNumber)).toEqual([1, 2, 3]);
    expect(loaded.history.records.every((record) => record.cleanLatencyMedianMs === null)).toBe(true);
  });

  it("deletes obsolete pilot history storage instead of migrating it", () => {
    const storage = new MemoryStorage();
    const obsoleteKey = OBSOLETE_LOCAL_PILOT_HISTORY_KEYS[0]!;
    storage.setItem(obsoleteKey, JSON.stringify({ schemaVersion: 1, records: [] }));
    const loaded = loadLocalPilotHistory(storage, progressWithSummaries(0), environment);
    expect(loaded).toEqual({
      history: { schemaVersion: PILOT_HISTORY_SCHEMA_VERSION, records: [] },
      recoveredFromInvalidState: true,
    });
    expect(storage.getItem(obsoleteKey)).toBeNull();
    expect(storage.getItem(LOCAL_PILOT_HISTORY_KEY)).toBeNull();
  });

  it("reconciles a history write that is one round behind product progress", () => {
    const storage = new MemoryStorage();
    const progress = progressWithSummaries(3);
    const migrated = migratePilotHistory(progress);
    const behind: PilotHistory = {
      schemaVersion: PILOT_HISTORY_SCHEMA_VERSION,
      records: migrated.records.slice(0, 2).map((record) => withLatency(record, 50)),
    };
    saveLocalPilotHistory(storage, behind);
    const loaded = loadLocalPilotHistory(storage, progress, environment);
    expect(loaded.history.records.map((record) => record.roundNumber)).toEqual([1, 2, 3]);
    expect(loaded.history.records[0]?.cleanLatencyMedianMs).toBe(50);
    expect(loaded.history.records[2]?.cleanLatencyMedianMs).toBeNull();
  });

  it("falls back safely when persisted pilot history is malformed", () => {
    const storage = new MemoryStorage();
    storage.setItem(LOCAL_PILOT_HISTORY_KEY, "{broken");
    const progress = progressWithSummaries(2);
    const loaded = loadLocalPilotHistory(storage, progress, environment);
    expect(loaded.recoveredFromInvalidState).toBe(true);
    expect(loaded.history.records).toHaveLength(2);
  });

  it("produces deterministic export without local seed or export timestamp", () => {
    const progress = progressWithSummaries(2);
    const history = migratePilotHistory(progress);
    const first = createPilotExport(environment, progress, history);
    const second = createPilotExport(environment, progress, history);
    expect(first).toBe(second);
    const parsed = JSON.parse(first) as Record<string, unknown>;
    expect(parsed.seed).toBeUndefined();
    expect(parsed.exportedAt).toBeUndefined();
    expect(parsed.utterancePolicyVersion).toBe("frequency-first-utterance-v1");
    expect(parsed.selection).toEqual(progress.selection);
    expect(parsed.history).toEqual(history.records);
    const partition = parsed.catalogPartition as {
      practiceEntryIds: string[];
      evaluationEntryIds: string[];
    };
    expect(partition.practiceEntryIds).toEqual([...partition.practiceEntryIds].sort());
    expect(partition.evaluationEntryIds).toEqual([...partition.evaluationEntryIds].sort());
  });
});

import { describe, expect, it } from "vitest";
import type { InteractionInput } from "../../src/practice/interaction-session.js";
import {
  applyProductInput,
  createFreshProgressForEnvironment,
  createProductEnvironment,
  createProductState,
} from "../../src/product/session.js";
import {
  appendPilotRoundRecord,
  createPilotRoundRecord,
  migratePilotHistory,
  parsePilotHistory,
  PILOT_HISTORY_LIMIT,
  PILOT_HISTORY_SCHEMA_VERSION,
  serializePilotHistory,
  type PilotRoundRecord,
} from "../../src/product/pilot-history.js";
import type { ProductProgress } from "../../src/product/types.js";
import { PRODUCT_CATALOGS } from "./fixtures.js";

const environment = createProductEnvironment(PRODUCT_CATALOGS);

function completeRound() {
  const progress = createFreshProgressForEnvironment(
    environment,
    "pilot-seed",
    "guided",
    "standard",
  );
  let state = createProductState(environment, progress, 0);
  let timestamp = 0;
  while (state.summary === null) {
    const target = state.session.targets[state.session.position]!;
    timestamp += 50;
    const input: InteractionInput = {
      timestampMs: timestamp,
      physicalCode: "Test",
      actualToken: target.tokenId,
      repeat: false,
      composing: false,
      modifierOnly: false,
    };
    state = applyProductInput(
      environment,
      state,
      input,
      "2026-07-20T00:00:00.000Z",
    );
  }
  return state;
}

function numbered(record: PilotRoundRecord, roundNumber: number): PilotRoundRecord {
  return {
    ...record,
    roundNumber,
    exerciseId: `round-${roundNumber}`,
    completedAt: `2026-07-20T00:${String(roundNumber).padStart(2, "0")}:00.000Z`,
  };
}

describe("pilot history", () => {
  it("records the median of Phase 3 eligible clean latency samples", () => {
    const completed = completeRound();
    const record = createPilotRoundRecord(
      1,
      completed.round,
      completed.summary!,
      completed.session.traces,
      environment.measurementPolicy,
    );
    expect(record.timingSamples).toBeGreaterThan(0);
    expect(record.cleanLatencyMedianMs).toBe(50);
  });

  it("retains the latest rounds in strict chronological order", () => {
    const completed = completeRound();
    const base = createPilotRoundRecord(
      1,
      completed.round,
      completed.summary!,
      completed.session.traces,
      environment.measurementPolicy,
    );
    let history = migratePilotHistory(createFreshProgressForEnvironment(
      environment,
      "empty",
      "guided",
      "standard",
    ));
    for (let round = 1; round <= 30; round += 1) {
      history = appendPilotRoundRecord(history, numbered(base, round));
    }
    expect(history.records).toHaveLength(PILOT_HISTORY_LIMIT);
    expect(history.records[0]?.roundNumber).toBe(7);
    expect(history.records.at(-1)?.roundNumber).toBe(30);
  });

  it("derives current-generation summaries with explicit unknown latency", () => {
    const completed = completeRound();
    const currentProgress: ProductProgress = {
      ...completed.progress,
      practiceRoundsCompleted: 3,
      evaluationRoundsCompleted: 1,
      recentSummaries: [completed.summary!],
    };
    const migrated = migratePilotHistory(currentProgress);
    expect(migrated.records).toHaveLength(1);
    expect(migrated.records[0]?.roundNumber).toBe(4);
    expect(migrated.records[0]?.cleanLatencyMedianMs).toBeNull();
  });

  it("rejects history records that reference the wrong catalog partition", () => {
    const completed = completeRound();
    const record = createPilotRoundRecord(
      1,
      completed.round,
      completed.summary!,
      completed.session.traces,
      environment.measurementPolicy,
    );
    const invalid = {
      schemaVersion: PILOT_HISTORY_SCHEMA_VERSION,
      records: [{ ...record, kind: "evaluation", phase: "evaluation" }],
    };
    expect(parsePilotHistory(JSON.stringify(invalid), environment)).toBeNull();
    expect(parsePilotHistory(
      serializePilotHistory({
        schemaVersion: PILOT_HISTORY_SCHEMA_VERSION,
        records: [record],
      }),
      environment,
    )).not.toBeNull();
  });

  it("rejects the obsolete pilot history schema", () => {
    expect(parsePilotHistory(
      JSON.stringify({ schemaVersion: 1, records: [] }),
      environment,
    )).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import {
  createProductBackup,
  parseProductBackup,
} from "../../src/app/backup.js";
import { migratePilotHistory } from "../../src/product/pilot-history.js";
import {
  createFreshProgressForEnvironment,
  createProductEnvironment,
} from "../../src/product/session.js";
import { PRODUCT_CATALOGS } from "../product/fixtures.js";

const environment = createProductEnvironment(PRODUCT_CATALOGS);

describe("product backup", () => {
  it("round-trips validated progress, history, and selection tuning", () => {
    const progress = createFreshProgressForEnvironment(
      environment,
      "backup-seed",
      "guided",
      "standard",
    );
    const history = migratePilotHistory(progress);
    const source = createProductBackup(
      progress,
      history,
      { errorInfluence: 1.25, timingInfluence: 0.5 },
      "2026-07-24T00:00:00.000Z",
    );

    expect(parseProductBackup(source, environment, "guided", "standard")).toEqual({
      backupVersion: 1,
      exportedAt: "2026-07-24T00:00:00.000Z",
      progress,
      pilotHistory: history,
      selectionTuning: { errorInfluence: 1.25, timingInfluence: 0.5 },
    });
  });

  it("rejects malformed and incompatible backups", () => {
    expect(parseProductBackup("not json", environment, "guided", "standard"))
      .toBeNull();
    expect(parseProductBackup(
      JSON.stringify({ backupVersion: 1 }),
      environment,
      "guided",
      "standard",
    )).toBeNull();
  });
});

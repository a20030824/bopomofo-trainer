import { describe, expect, it } from "vitest";
import {
  RELATIONAL_COMPOSITION_STRATEGY_IDS,
  RELATIONAL_LEARNER_MODEL_IDS,
  RELATIONAL_OBJECTIVE_STRATEGY_IDS,
  RELATIONAL_PARTITION_POLICY_IDS,
  createRelationalStrategyMatrix,
  relationalStrategyCellId,
  serializeRelationalStrategyMatrix,
} from "../../src/simulation/strategy-matrix.js";

describe("relational strategy matrix", () => {
  it("declares the complete four-axis Cartesian product exactly once", () => {
    const matrix = createRelationalStrategyMatrix();
    const expectedIds = RELATIONAL_OBJECTIVE_STRATEGY_IDS.flatMap((objective) =>
      RELATIONAL_PARTITION_POLICY_IDS.flatMap((partition) =>
        RELATIONAL_COMPOSITION_STRATEGY_IDS.flatMap((composer) =>
          RELATIONAL_LEARNER_MODEL_IDS.map((learner) =>
            relationalStrategyCellId(objective, partition, composer, learner)
          )
        )
      )
    );

    expect(matrix.schemaVersion).toBe("relational-strategy-matrix-v1");
    expect(matrix.purpose).toBe("declaration-only");
    expect(matrix.executionBoundary).toBe("experiment-harness-required");
    expect(matrix.cells.map((cell) => cell.id)).toEqual(expectedIds);
    expect(new Set(expectedIds).size).toBe(expectedIds.length);
  });

  it("keeps the historical binding/fixed-six learner combination as the baseline", () => {
    const baseline = relationalStrategyCellId(
      "binding-only-baseline",
      "binding-preserving-baseline-v1",
      "fixed-six-baseline",
      "synthetic-relational-v1",
    );
    const matrix = createRelationalStrategyMatrix();
    const extended = createRelationalStrategyMatrix({
      learnerModelIds: ["synthetic-relational-v1", "alternate-model-v1"],
    });

    expect(matrix.baselineCellId).toBe(baseline);
    expect(matrix.cells.some((cell) => cell.id === baseline)).toBe(true);
    expect(extended.axes.learnerModelIds).toEqual([
      "alternate-model-v1",
      "synthetic-relational-v1",
    ]);
    expect(extended.baselineCellId).toBe(baseline);
    expect(extended.cells.some((cell) => cell.id === baseline)).toBe(true);
  });

  it("canonicalizes input order and replays byte-for-byte", () => {
    const canonical = createRelationalStrategyMatrix();
    const reversed = createRelationalStrategyMatrix({
      objectiveStrategyIds: [...RELATIONAL_OBJECTIVE_STRATEGY_IDS].reverse(),
      partitionPolicyIds: [...RELATIONAL_PARTITION_POLICY_IDS].reverse(),
      compositionStrategyIds: [...RELATIONAL_COMPOSITION_STRATEGY_IDS].reverse(),
      learnerModelIds: [...RELATIONAL_LEARNER_MODEL_IDS].reverse(),
    });

    expect(serializeRelationalStrategyMatrix(reversed)).toBe(
      serializeRelationalStrategyMatrix(canonical),
    );
    expect(reversed.determinismDigest).toBe(canonical.determinismDigest);
  });

  it("keeps seeds, scenarios, and cohorts outside declaration cells", () => {
    const firstCell = createRelationalStrategyMatrix().cells[0]!;
    expect(Object.keys(firstCell).sort()).toEqual([
      "compositionStrategyId",
      "id",
      "learnerModelId",
      "objectiveStrategyId",
      "partitionPolicyId",
    ]);
  });

  it("rejects duplicate axes and matrices that remove the baseline", () => {
    expect(() => createRelationalStrategyMatrix({
      objectiveStrategyIds: ["frequency-random", "frequency-random"],
    })).toThrow("objectiveStrategyIds contains duplicate strategy frequency-random");

    expect(() => createRelationalStrategyMatrix({
      learnerModelIds: ["synthetic-relational-v1", "synthetic-relational-v1"],
    })).toThrow("learnerModelIds must not contain duplicate model ids");

    expect(() => createRelationalStrategyMatrix({
      objectiveStrategyIds: ["transition-aware"],
    })).toThrow("strategy matrix options exclude the required baseline cell");

    expect(() => createRelationalStrategyMatrix({
      learnerModelIds: ["alternate-model-v1"],
    })).toThrow("strategy matrix options exclude the required baseline cell");
  });
});

import {
  RELATIONAL_COMPOSITION_STRATEGY_IDS,
  RELATIONAL_LEARNER_MODEL_IDS,
  RELATIONAL_OBJECTIVE_STRATEGY_IDS,
  RELATIONAL_PARTITION_POLICY_IDS,
  createRelationalStrategyMatrix,
  serializeRelationalStrategyMatrix,
} from "../src/simulation/strategy-matrix.js";

const matrix = createRelationalStrategyMatrix();
const serialized = serializeRelationalStrategyMatrix(matrix);

if (process.argv.includes("--verify")) {
  const replay = createRelationalStrategyMatrix({
    objectiveStrategyIds: [...RELATIONAL_OBJECTIVE_STRATEGY_IDS].reverse(),
    partitionPolicyIds: [...RELATIONAL_PARTITION_POLICY_IDS].reverse(),
    compositionStrategyIds: [...RELATIONAL_COMPOSITION_STRATEGY_IDS].reverse(),
    learnerModelIds: [...RELATIONAL_LEARNER_MODEL_IDS].reverse(),
  });
  if (serializeRelationalStrategyMatrix(replay) !== serialized) {
    throw new Error("relational strategy matrix is not input-order invariant");
  }
} else {
  process.stdout.write(serialized);
}

process.stderr.write(
  `relational strategy matrix ${matrix.determinismDigest} `
  + `(${matrix.cells.length} cells, baseline ${matrix.baselineCellId})\n`,
);

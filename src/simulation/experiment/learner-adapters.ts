import { generateSyntheticTraceBatch } from "../trace-generator/generate.js";
import type {
  LearnerModelStrategy,
  RelationalLearnerModelId,
} from "../strategy-matrix.js";

export function createLearnerModelRegistry(): Readonly<Record<
  RelationalLearnerModelId,
  LearnerModelStrategy
>> {
  return {
    "synthetic-relational-v1": {
      id: "synthetic-relational-v1",
      run(input) {
        if (input.sequence.mode === null || input.sequence.layoutId === null) {
          throw new Error("learner adapter requires a resolved practice sequence scope");
        }
        if (input.sequence.items.length === 0) {
          throw new Error("learner adapter requires at least one practice entry");
        }
        return generateSyntheticTraceBatch(
          {
            id: `experiment:${input.scenarioId}:${input.seed}`,
            mode: input.sequence.mode,
            layoutId: input.sequence.layoutId,
            entries: input.sequence.items.map((item) => item.entry),
          },
          input.layout,
          input.measurementPolicy,
          input.learner,
          {
            scenarioId: input.scenarioId,
            seed: input.seed,
            startedAtMs: input.startedAtMs,
            retentionSteps: input.retentionSteps,
          },
        );
      },
    },
  };
}

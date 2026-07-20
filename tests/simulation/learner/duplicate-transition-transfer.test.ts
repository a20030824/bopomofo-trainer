import { describe, expect, it } from "vitest";
import { getSyntheticScenario } from "../../../src/simulation/learner/scenarios.js";
import { validateSyntheticLearnerState } from "../../../src/simulation/learner/state.js";

describe("synthetic transition transfer validation", () => {
  it("rejects duplicate target transition keys before exposure updates can compound them", () => {
    const learner = getSyntheticScenario("zero-learning").learner;
    const transitionKeys = Object.keys(learner.transitions);
    const sourceKey = transitionKeys[0];
    const targetKey = transitionKeys.find((key) => key !== sourceKey);

    expect(sourceKey).toBeDefined();
    expect(targetKey).toBeDefined();

    const source = learner.transitions[sourceKey!];
    expect(source).toBeDefined();

    const invalidLearner = {
      ...learner,
      transitions: {
        ...learner.transitions,
        [sourceKey!]: {
          ...source!,
          transfer: [
            { targetTransitionKey: targetKey!, factor: 0.2 },
            { targetTransitionKey: targetKey!, factor: 0.3 },
          ],
        },
      },
    };

    expect(() => validateSyntheticLearnerState(invalidLearner)).toThrowError(
      `transition ${sourceKey} transfer target ${targetKey} is duplicated`,
    );
  });
});

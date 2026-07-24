import { describe, expect, it } from "vitest";
import { STANDARD_BOPOMOFO_LAYOUT } from "../../src/scheme/standard-layout.js";
import {
  createFreshProgressForEnvironment,
  createProductEnvironment,
  createProductState,
} from "../../src/product/session.js";
import {
  EVALUATION_CATALOG,
  PRACTICE_CATALOG,
  SYNTAX_PROFILES,
} from "../../src/app/generated/catalog.js";

describe("frequency-first product real catalog integration", () => {
  it("packages the complete runtime catalog as practice and never schedules evaluation", () => {
    expect(PRACTICE_CATALOG.length).toBeGreaterThan(0);
    expect(EVALUATION_CATALOG).toEqual([]);

    const environment = createProductEnvironment({
      practice: PRACTICE_CATALOG,
      evaluation: EVALUATION_CATALOG,
      syntaxProfiles: SYNTAX_PROFILES,
    });
    const progress = createFreshProgressForEnvironment(
      environment,
      "integration",
      "guided",
      STANDARD_BOPOMOFO_LAYOUT.id,
    );
    const state = createProductState(environment, progress, 0);
    expect(state.round.kind).toBe("practice");
    expect(state.round.selection.stage).toBe(1);
    expect(state.round.exercise.entries).toEqual(state.round.selection.utterance.entries);
    expect(state.round.exercise.entries.length).toBeGreaterThan(1);
    expect(state.round.exercise.entries.every((entry) => entry.frequencyBand === 1)).toBe(true);
    expect(state.round.selection.utterance.kind).toBe("formal-syntax");
    expect(state.round.selection.utterance.syntaxDerivationId).toBeTruthy();

    const formerBoundaryProgress = {
      ...progress,
      practiceRoundsCompleted: 5,
      curriculum: { ...progress.curriculum, round: 5 },
    };
    const nextState = createProductState(environment, formerBoundaryProgress, 1);
    expect(nextState.round.kind).toBe("practice");
    expect(nextState.round.exercise.id).toBe("practice-6");
    expect(nextState.round.selection.utterance.kind).toBe("formal-syntax");
    expect(nextState.round.exercise.entries.length).toBeGreaterThan(0);
  });
});

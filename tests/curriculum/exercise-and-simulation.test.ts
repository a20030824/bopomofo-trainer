import { describe, expect, it } from "vitest";
import { buildCurriculumExercise } from "../../src/curriculum/exercise-builder.js";
import { PHASE_4_CURRICULUM_POLICY } from "../../src/curriculum/policy.js";
import { createSeededRandom } from "../../src/curriculum/random.js";
import { createStandardSimulationScenarios } from "../../src/curriculum/scenarios.js";
import { runCurriculumSimulation } from "../../src/curriculum/simulator.js";
import { eligibleProfile, support } from "./fixtures.js";

describe("exercise builder and simulator", () => {
  it("raises focused exposure without duplicate entries and exposes weighted choices", () => {
    const profile = eligibleProfile({
      "token:A": { timingMs: 460, errorRate: 0.4 },
    });
    const result = buildCurriculumExercise(
      support,
      profile,
      "token:A",
      PHASE_4_CURRICULUM_POLICY,
      createSeededRandom("exercise"),
    );
    const ids = result.exercise.entries.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(
      result.exercise.entries.filter(
        (item) => item.syllables[0]!.tokens.includes("token:A"),
      ).length,
    ).toBeGreaterThanOrEqual(
      Math.ceil(
        PHASE_4_CURRICULUM_POLICY.exerciseEntryCount
          * PHASE_4_CURRICULUM_POLICY.focusedEntryShare,
      ),
    );
    expect(result.picks).toHaveLength(result.exercise.entries.length);
    expect(result.picks.every((pick) => pick.candidates.length > 0)).toBe(true);
  });

  it("produces byte-for-byte identical reports for identical seeds", () => {
    const profile = eligibleProfile({
      "token:A": { timingMs: 460, errorRate: 0.4 },
    });
    const scenario = {
      name: "determinism",
      seed: "same-seed",
      rounds: 5,
      profile,
      performance: {
        "token:A": { timingMs: 460, errorRate: 0.4 },
      },
    } as const;
    const first = runCurriculumSimulation(
      support,
      PHASE_4_CURRICULUM_POLICY,
      scenario,
    );
    const second = runCurriculumSimulation(
      support,
      PHASE_4_CURRICULUM_POLICY,
      scenario,
    );
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(first.determinismDigest).toBe(second.determinismDigest);
    expect(
      first.rounds.some((round) => round.stateTransitions.length > 0),
    ).toBe(true);
  });

  it("provides the required standard synthetic scenarios", () => {
    const scenarios = createStandardSimulationScenarios(
      support,
      PHASE_4_CURRICULUM_POLICY,
      "standard",
      2,
    );
    expect(scenarios.map((scenario) => scenario.name)).toEqual([
      "new-learner",
      "weak-common-binding",
      "rare-unsupported-binding",
      "competing-weak-bindings",
      "cooldown-prevents-refocus",
    ]);
  });
});

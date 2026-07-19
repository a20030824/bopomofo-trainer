import { describe, expect, it } from "vitest";
import type { InteractionInput } from "../../src/practice/interaction-session.js";
import {
  applyProductInput,
  createFreshProgressForEnvironment,
  createProductEnvironment,
  createProductState,
  startNextProductRound,
} from "../../src/product/session.js";
import {
  parseProductProgress,
  serializeProductProgress,
} from "../../src/product/progress.js";
import { EVALUATION, PRACTICE } from "./fixtures.js";

const environment = createProductEnvironment({
  practice: PRACTICE,
  evaluation: EVALUATION,
});

function complete(state: ReturnType<typeof createProductState>) {
  let current = state;
  let timestamp = 100;
  while (current.summary === null) {
    const target = current.session.targets[current.session.position]!;
    timestamp += 50;
    const input: InteractionInput = {
      timestampMs: timestamp,
      physicalCode: "Test",
      actualToken: target.tokenId,
      repeat: false,
      composing: false,
      modifierOnly: false,
    };
    current = applyProductInput(
      environment,
      current,
      input,
      "2026-07-20T00:00:00.000Z",
    );
  }
  return current;
}

describe("thin product session loop", () => {
  it("requires unique disjoint practice and evaluation catalogs", () => {
    expect(() => createProductEnvironment({
      practice: PRACTICE,
      evaluation: [PRACTICE[0]!, ...EVALUATION],
    })).toThrow(/disjoint/);
    expect(() => createProductEnvironment({
      practice: [PRACTICE[0]!, PRACTICE[0]!, ...PRACTICE.slice(1)],
      evaluation: EVALUATION,
    })).toThrow(/duplicate/);
  });

  it("updates practice measurement and curriculum exactly once", () => {
    const progress = createFreshProgressForEnvironment(
      environment,
      "seed",
      "guided",
      "standard",
    );
    const completed = complete(createProductState(environment, progress, 0));
    expect(completed.round.kind).toBe("practice");
    expect(completed.progress.practiceRoundsCompleted).toBe(1);
    expect(completed.progress.curriculum.round).toBe(1);
    expect(completed.progress.measurements.bindingObservationCount).toBeGreaterThan(0);

    const unchanged = applyProductInput(environment, completed, {
      timestampMs: 999,
      physicalCode: "Test",
      actualToken: "tone:1",
      repeat: false,
      composing: false,
      modifierOnly: false,
    }, "2026-07-20T00:00:01.000Z");
    expect(unchanged).toBe(completed);
  });

  it("restores a deterministic next exercise after serialization", () => {
    const fresh = createFreshProgressForEnvironment(environment, "seed", "guided", "standard");
    const completed = complete(createProductState(environment, fresh, 0));
    const next = startNextProductRound(environment, completed, 500);
    const restored = parseProductProgress(
      serializeProductProgress(completed.progress),
      environment.practiceSupport,
      "guided",
      "standard",
      environment.measurementPolicy,
      environment.curriculumPolicy.version,
    )!;
    const reloaded = createProductState(environment, restored, 700);
    expect(reloaded.round.exercise.entries.map((item) => item.id)).toEqual(
      next.round.exercise.entries.map((item) => item.id),
    );
    expect(reloaded.round.focus).toEqual(next.round.focus);
  });

  it("keeps held-out evaluation separate from adaptive measurements", () => {
    const fresh = createFreshProgressForEnvironment(environment, "seed", "guided", "standard");
    const progress = {
      ...fresh,
      practiceRoundsCompleted: 5,
      curriculum: { ...fresh.curriculum, round: 5 },
    };
    const state = createProductState(environment, progress, 0);
    expect(state.round.kind).toBe("evaluation");
    const beforeMeasurements = JSON.stringify(state.progress.measurements);
    const beforeCurriculum = JSON.stringify(state.progress.curriculum);
    const completed = complete(state);
    expect(completed.progress.evaluationRoundsCompleted).toBe(1);
    expect(JSON.stringify(completed.progress.measurements)).toBe(beforeMeasurements);
    expect(JSON.stringify(completed.progress.curriculum)).toBe(beforeCurriculum);
  });
});

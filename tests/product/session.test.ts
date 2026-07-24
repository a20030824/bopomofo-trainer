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
import {
  EVALUATION,
  PRACTICE,
  PRODUCT_CATALOGS,
  SYNTAX_PROFILES,
} from "./fixtures.js";

const environment = createProductEnvironment(PRODUCT_CATALOGS);

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

describe("frequency-first grammatical product session loop", () => {
  it("requires unique disjoint syntax-profiled catalogs and allows no evaluation entries", () => {
    expect(() => createProductEnvironment({
      ...PRODUCT_CATALOGS,
      practice: PRACTICE,
      evaluation: [PRACTICE[0]!, ...EVALUATION],
    })).toThrow(/disjoint/);
    expect(() => createProductEnvironment({
      ...PRODUCT_CATALOGS,
      practice: [PRACTICE[0]!, PRACTICE[0]!, ...PRACTICE.slice(1)],
      evaluation: EVALUATION,
    })).toThrow(/duplicate/);
    expect(() => createProductEnvironment({
      practice: PRACTICE,
      evaluation: EVALUATION,
      syntaxProfiles: [],
    })).toThrow(/missing syntax profiles/);

    const practiceIds = new Set(PRACTICE.map((entry) => entry.id));
    const practiceOnly = createProductEnvironment({
      practice: PRACTICE,
      evaluation: [],
      syntaxProfiles: SYNTAX_PROFILES.filter((profile) => practiceIds.has(profile.entryId)),
    });
    expect(practiceOnly.catalogs.evaluation).toEqual([]);
  });

  it("builds one complete grammar-valid utterance instead of six unrelated entries", () => {
    const progress = createFreshProgressForEnvironment(
      environment,
      "grammar-seed",
      "guided",
      "standard",
    );
    const state = createProductState(environment, progress, 0);
    expect(state.round.selection.utterance.id).toBeTruthy();
    expect(state.round.exercise.entries.map((entry) => entry.id)).toEqual(
      state.round.selection.utterance.entries.map((entry) => entry.id),
    );
    expect(state.round.exercise.entries.length).toBeGreaterThan(1);
    expect(state.round.selection.utterance.kind).toBe("formal-syntax");
  });

  it("reports interaction accuracy across boundaries without counting browser noise", () => {
    const progress = createFreshProgressForEnvironment(
      environment,
      "accuracy-seed",
      "guided",
      "standard",
    );
    const initial = createProductState(environment, progress, 0);
    const targetCount = initial.session.targets.length;
    const expected = initial.session.targets[0]!.tokenId;
    const wrongToken = expected === "tone:1" ? "tone:2" : "tone:1";

    let current = applyProductInput(environment, initial, {
      timestampMs: 10,
      physicalCode: "WrongMappedKey",
      actualToken: wrongToken,
      repeat: false,
      composing: false,
      modifierOnly: false,
    }, "2026-07-20T00:00:00.000Z");
    current = applyProductInput(environment, current, {
      timestampMs: 20,
      physicalCode: "ArrowLeft",
      actualToken: null,
      repeat: false,
      composing: false,
      modifierOnly: false,
    }, "2026-07-20T00:00:00.000Z");
    current = applyProductInput(environment, current, {
      timestampMs: 30,
      physicalCode: "HeldKey",
      actualToken: expected,
      repeat: true,
      composing: false,
      modifierOnly: false,
    }, "2026-07-20T00:00:00.000Z");

    const completed = complete(current);
    expect(completed.summary).not.toBeNull();
    expect(completed.summary!.attempts).toBe(targetCount + 1);
    expect(completed.summary!.errors).toBe(1);
    expect(completed.progress.measurements.bindingObservationCount).toBeLessThan(
      completed.summary!.attempts,
    );
  });

  it("updates practice measurements, stage evidence, and legacy diagnostics exactly once", () => {
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
    expect(completed.progress.selection.stagePracticeRounds).toBe(1);
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

  it("restores the same next utterance and template after serialization", () => {
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
      environment.utterancePolicy,
    )!;
    const reloaded = createProductState(environment, restored, 700);
    expect(reloaded.round.selection.utterance.id).toBe(next.round.selection.utterance.id);
    expect(reloaded.round.selection.utterance.templateId)
      .toBe(next.round.selection.utterance.templateId);
    expect(reloaded.round.exercise.entries.map((item) => item.id)).toEqual(
      next.round.exercise.entries.map((item) => item.id),
    );
  });

  it("continues normal practice after the former five-round evaluation boundary", () => {
    const fresh = createFreshProgressForEnvironment(environment, "seed", "guided", "standard");
    const progress = {
      ...fresh,
      practiceRoundsCompleted: 5,
      curriculum: { ...fresh.curriculum, round: 5 },
    };
    const state = createProductState(environment, progress, 0);
    expect(state.round.kind).toBe("practice");
    expect(state.round.exercise.id).toBe("practice-6");

    const beforeMeasurements = state.progress.measurements.bindingObservationCount;
    const completed = complete(state);
    expect(completed.progress.practiceRoundsCompleted).toBe(6);
    expect(completed.progress.evaluationRoundsCompleted).toBe(0);
    expect(completed.progress.curriculum.round).toBe(6);
    expect(completed.progress.measurements.bindingObservationCount)
      .toBeGreaterThan(beforeMeasurements);
  });
});

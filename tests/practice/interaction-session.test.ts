import { describe, expect, it } from "vitest";
import type { Exercise } from "../../src/core/model.js";
import {
  applyInteractionInput,
  createInteractionSession,
  flattenExercise,
} from "../../src/practice/interaction-session.js";

const exercise: Exercise = {
  id: "test",
  mode: "guided",
  layoutId: "zhuyin-standard",
  entries: [
    {
      id: "word:中文",
      prompt: { text: "中文", locale: "zh-TW" },
      syllables: [
        { tokens: ["zhuyin:ㄓ", "tone:1"] },
        { tokens: ["zhuyin:ㄨ", "zhuyin:ㄣ", "tone:2"] },
      ],
      frequencyBand: 1,
      tags: ["test"],
      provenanceIds: ["test"],
    },
    {
      id: "word:工",
      prompt: { text: "工", locale: "zh-TW" },
      syllables: [{ tokens: ["zhuyin:ㄍ", "zhuyin:ㄨ", "zhuyin:ㄥ", "tone:1"] }],
      frequencyBand: 1,
      tags: ["test"],
      provenanceIds: ["test"],
    },
  ],
};

function input(
  timestampMs: number,
  physicalCode: string,
  actualToken: string | null,
  overrides: Partial<{ repeat: boolean; composing: boolean; modifierOnly: boolean }> = {},
) {
  return {
    timestampMs,
    physicalCode,
    actualToken,
    repeat: overrides.repeat ?? false,
    composing: overrides.composing ?? false,
    modifierOnly: overrides.modifierOnly ?? false,
  };
}

describe("interaction session", () => {
  it("preserves exercise, syllable, entry, within-syllable, and tone contexts", () => {
    expect(flattenExercise(exercise).map((target) => target.context)).toEqual([
      "exercise-start",
      "tone",
      "syllable-start",
      "within-syllable",
      "tone",
      "entry-start",
      "within-syllable",
      "within-syllable",
      "tone",
    ]);
  });

  it("advances exactly one target on a correct key", () => {
    const state = applyInteractionInput(
      createInteractionSession(exercise, 100),
      input(150, "Digit5", "zhuyin:ㄓ"),
    );

    expect(state.position).toBe(1);
    expect(state.traces[0]).toMatchObject({
      outcome: "correct",
      advanced: true,
      elapsedSinceAdvanceMs: 50,
      entryIndex: 0,
      syllableIndex: 0,
      tokenIndex: 0,
    });
  });

  it("does not advance on errors and marks the next correct attempt as recovery", () => {
    let state = createInteractionSession(exercise, 100);
    state = applyInteractionInput(state, input(150, "KeyJ", "zhuyin:ㄨ"));
    expect(state.position).toBe(0);
    expect(state.traces[0]?.outcome).toBe("incorrect");

    state = applyInteractionInput(state, input(220, "Digit5", "zhuyin:ㄓ"));
    expect(state.position).toBe(1);
    expect(state.traces[1]?.recovery).toBe(true);
    expect(state.traces[1]?.elapsedSinceAdvanceMs).toBe(120);
  });

  it("treats unmapped keys as errors without advancing", () => {
    const state = applyInteractionInput(
      createInteractionSession(exercise, 100),
      input(125, "ArrowDown", null),
    );

    expect(state.position).toBe(0);
    expect(state.hadErrorSinceAdvance).toBe(true);
    expect(state.traces[0]).toMatchObject({ outcome: "unmapped", correct: false });
  });

  it("traces repeats, modifiers, and composition without advancing or creating an error", () => {
    let state = createInteractionSession(exercise, 100);
    state = applyInteractionInput(state, input(110, "Digit5", "zhuyin:ㄓ", { repeat: true }));
    state = applyInteractionInput(state, input(120, "ShiftLeft", null, { modifierOnly: true }));
    state = applyInteractionInput(state, input(130, "Process", null, { composing: true }));

    expect(state.position).toBe(0);
    expect(state.hadErrorSinceAdvance).toBe(false);
    expect(state.traces.map((trace) => trace.outcome)).toEqual([
      "ignored-repeat",
      "ignored-modifier",
      "composition",
    ]);
  });
});

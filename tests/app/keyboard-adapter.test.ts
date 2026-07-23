import { describe, expect, it } from "vitest";
import {
  isInspectionAdvanceShortcut,
  keyboardEventToInput,
} from "../../src/app/keyboard-adapter.js";
import { STANDARD_BOPOMOFO_LAYOUT } from "../../src/scheme/standard-layout.js";

function event(overrides: Partial<{
  code: string;
  key: string;
  repeat: boolean;
  isComposing: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}> = {}) {
  return {
    code: overrides.code ?? "Digit5",
    key: overrides.key ?? "5",
    repeat: overrides.repeat ?? false,
    isComposing: overrides.isComposing ?? false,
    altKey: overrides.altKey ?? false,
    ctrlKey: overrides.ctrlKey ?? false,
    metaKey: overrides.metaKey ?? false,
    shiftKey: overrides.shiftKey ?? false,
  };
}

describe("keyboardEventToInput", () => {
  it("maps physical KeyboardEvent.code values to semantic tokens", () => {
    expect(keyboardEventToInput(event(), STANDARD_BOPOMOFO_LAYOUT, 42, false)).toMatchObject({
      physicalCode: "Digit5",
      actualToken: "zhuyin:ㄓ",
      timestampMs: 42,
    });
  });

  it("maps all five tone keys, including Space for explicit first tone", () => {
    const cases = [
      ["Space", " ", "tone:1"],
      ["Digit6", "6", "tone:2"],
      ["Digit3", "3", "tone:3"],
      ["Digit4", "4", "tone:4"],
      ["Digit7", "7", "tone:5"],
    ] as const;

    for (const [code, key, tokenId] of cases) {
      expect(keyboardEventToInput(
        event({ code, key }),
        STANDARD_BOPOMOFO_LAYOUT,
        42,
        false,
      ).actualToken).toBe(tokenId);
    }
  });

  it("detects composition and shortcut modifiers", () => {
    expect(keyboardEventToInput(
      event({ code: "Process", key: "Process", isComposing: true }),
      STANDARD_BOPOMOFO_LAYOUT,
      42,
      false,
    ).composing).toBe(true);

    expect(keyboardEventToInput(
      event({ code: "KeyS", key: "s", ctrlKey: true }),
      STANDARD_BOPOMOFO_LAYOUT,
      42,
      false,
    ).modifierOnly).toBe(true);
  });

  it("reserves plain F8 as the hidden inspection advance key", () => {
    expect(isInspectionAdvanceShortcut(event({ code: "F8", key: "F8" }))).toBe(true);
    expect(isInspectionAdvanceShortcut(event({
      code: "F8",
      key: "F8",
      repeat: true,
    }))).toBe(false);
    expect(isInspectionAdvanceShortcut(event({
      code: "F8",
      key: "F8",
      shiftKey: true,
    }))).toBe(false);
    expect(isInspectionAdvanceShortcut(event({
      code: "F8",
      key: "F8",
      isComposing: true,
    }))).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import {
  KEYBOARD_GEOMETRY_ROWS,
  keyboardColumnSpan,
} from "../../src/app/keyboard-geometry.js";

const EXPECTED_ROW_CODES = [
  [
    "Backquote", "Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6",
    "Digit7", "Digit8", "Digit9", "Digit0", "Minus", "Equal", "Backspace",
  ],
  [
    "Tab", "KeyQ", "KeyW", "KeyE", "KeyR", "KeyT", "KeyY", "KeyU", "KeyI",
    "KeyO", "KeyP", "BracketLeft", "BracketRight", "Backslash",
  ],
  [
    "CapsLock", "KeyA", "KeyS", "KeyD", "KeyF", "KeyG", "KeyH", "KeyJ",
    "KeyK", "KeyL", "Semicolon", "Quote", "Enter",
  ],
  [
    "ShiftLeft", "KeyZ", "KeyX", "KeyC", "KeyV", "KeyB", "KeyN", "KeyM",
    "Comma", "Period", "Slash", "ShiftRight",
  ],
  [
    "ControlLeft", "MetaLeft", "AltLeft", "Space", "AltRight", "MetaRight",
    "ControlRight",
  ],
] as const;

describe("shared keyboard geometry", () => {
  it("preserves the full physical keyboard row order without duplicate codes", () => {
    expect(KEYBOARD_GEOMETRY_ROWS.map((row) => row.map((key) => key.code)))
      .toEqual(EXPECTED_ROW_CODES);

    const codes = KEYBOARD_GEOMETRY_ROWS.flatMap((row) => row.map((key) => key.code));
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("uses quarter-unit grid spans compatible with the existing keyboard sketch", () => {
    expect(keyboardColumnSpan({ code: "KeyA" })).toBe(4);
    expect(keyboardColumnSpan({ code: "Tab", units: 1.5 })).toBe(6);
    expect(keyboardColumnSpan({ code: "Enter", units: 2.25 })).toBe(9);
    expect(keyboardColumnSpan({ code: "Space", units: 7 })).toBe(28);
    expect(KEYBOARD_GEOMETRY_ROWS.flat().every((key) => keyboardColumnSpan(key) > 0))
      .toBe(true);
  });
});

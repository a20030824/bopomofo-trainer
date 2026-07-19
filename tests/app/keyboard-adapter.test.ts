import { describe, expect, it } from "vitest";
import { keyboardEventToInput } from "../../src/app/keyboard-adapter.js";
import { STANDARD_BOPOMOFO_LAYOUT } from "../../src/scheme/standard-layout.js";

function event(overrides: Partial<{
  code: string;
  key: string;
  repeat: boolean;
  isComposing: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}> = {}) {
  return {
    code: overrides.code ?? "Digit5",
    key: overrides.key ?? "5",
    repeat: overrides.repeat ?? false,
    isComposing: overrides.isComposing ?? false,
    altKey: overrides.altKey ?? false,
    ctrlKey: overrides.ctrlKey ?? false,
    metaKey: overrides.metaKey ?? false,
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

  it("maps Space to the explicit first-tone token", () => {
    expect(keyboardEventToInput(
      event({ code: "Space", key: " " }),
      STANDARD_BOPOMOFO_LAYOUT,
      42,
      false,
    ).actualToken).toBe("tone:1");
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
});

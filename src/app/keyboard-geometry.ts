export interface KeyboardGeometryKey {
  readonly code: string;
  readonly units?: number;
}

export const KEYBOARD_GEOMETRY_ROWS: readonly (readonly KeyboardGeometryKey[])[] = [
  [
    { code: "Backquote" }, { code: "Digit1" }, { code: "Digit2" },
    { code: "Digit3" }, { code: "Digit4" }, { code: "Digit5" },
    { code: "Digit6" }, { code: "Digit7" }, { code: "Digit8" },
    { code: "Digit9" }, { code: "Digit0" }, { code: "Minus" },
    { code: "Equal" }, { code: "Backspace", units: 2 },
  ],
  [
    { code: "Tab", units: 1.5 }, { code: "KeyQ" }, { code: "KeyW" },
    { code: "KeyE" }, { code: "KeyR" }, { code: "KeyT" }, { code: "KeyY" },
    { code: "KeyU" }, { code: "KeyI" }, { code: "KeyO" }, { code: "KeyP" },
    { code: "BracketLeft" }, { code: "BracketRight" }, { code: "Backslash", units: 1.5 },
  ],
  [
    { code: "CapsLock", units: 1.75 }, { code: "KeyA" }, { code: "KeyS" },
    { code: "KeyD" }, { code: "KeyF" }, { code: "KeyG" }, { code: "KeyH" },
    { code: "KeyJ" }, { code: "KeyK" }, { code: "KeyL" },
    { code: "Semicolon" }, { code: "Quote" }, { code: "Enter", units: 2.25 },
  ],
  [
    { code: "ShiftLeft", units: 2.25 }, { code: "KeyZ" }, { code: "KeyX" },
    { code: "KeyC" }, { code: "KeyV" }, { code: "KeyB" }, { code: "KeyN" },
    { code: "KeyM" }, { code: "Comma" }, { code: "Period" }, { code: "Slash" },
    { code: "ShiftRight", units: 2.75 },
  ],
  [
    { code: "ControlLeft", units: 1.5 }, { code: "MetaLeft", units: 1.25 },
    { code: "AltLeft", units: 1.25 }, { code: "Space", units: 7 },
    { code: "AltRight", units: 1.25 }, { code: "MetaRight", units: 1.25 },
    { code: "ControlRight", units: 1.5 },
  ],
] as const;

export function keyboardColumnSpan(key: KeyboardGeometryKey): number {
  return Math.round((key.units ?? 1) * 4);
}

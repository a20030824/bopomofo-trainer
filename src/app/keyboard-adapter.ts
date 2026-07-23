import type { InputLayout } from "../core/model.js";
import type { InteractionInput } from "../practice/interaction-session.js";

const MODIFIER_CODES = new Set([
  "AltLeft",
  "AltRight",
  "ControlLeft",
  "ControlRight",
  "MetaLeft",
  "MetaRight",
  "ShiftLeft",
  "ShiftRight",
]);

export interface KeyboardLikeEvent {
  readonly code: string;
  readonly key: string;
  readonly repeat: boolean;
  readonly isComposing: boolean;
  readonly altKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
}

/** Hidden local-review shortcut; intentionally absent from the visible UI. */
export function isInspectionAdvanceShortcut(event: KeyboardLikeEvent): boolean {
  return event.code === "F8"
    && !event.repeat
    && !event.isComposing
    && !event.altKey
    && !event.ctrlKey
    && !event.metaKey
    && !event.shiftKey;
}

export function keyboardEventToInput(
  event: KeyboardLikeEvent,
  layout: InputLayout,
  timestampMs: number,
  compositionActive: boolean,
): InteractionInput {
  const composing = compositionActive || event.isComposing || event.key === "Process";
  const shortcutModified = event.altKey || event.ctrlKey || event.metaKey;

  return {
    timestampMs,
    physicalCode: event.code,
    actualToken: layout.bindings[event.code] ?? null,
    repeat: event.repeat,
    composing,
    modifierOnly: MODIFIER_CODES.has(event.code) || shortcutModified,
  };
}

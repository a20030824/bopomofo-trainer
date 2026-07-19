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

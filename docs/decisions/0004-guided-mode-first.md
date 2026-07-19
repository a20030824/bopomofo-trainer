# ADR 0004: Guided mode is the first measured practice mode

## Status

Accepted

## Context

A Chinese-only prompt requires the learner to retrieve pronunciation before locating and pressing Bopomofo keys. That latency combines lexical recall, pronunciation choice, symbol recognition, keyboard mapping, and motor execution.

Keybr-like timing is closer to a visible-answer motor task: the learner sees the symbols that must be typed.

## Decision

V1 uses guided mode:

- Chinese vocabulary remains visible as context;
- the complete Bopomofo reading is visible;
- every tone, including first tone, is explicit;
- timing is interpreted as layout-specific symbol-to-key mapping and motor execution.

A later recall mode may hide Bopomofo, but it has a distinct practice-mode identity and separate statistics.

## Consequences

- V1 does not claim to test pronunciation recall.
- The interaction spike must make Bopomofo guidance easy to follow without overwhelming the Chinese context.
- Guided and recall observations cannot update the same confidence estimate.
- Word-level pronunciation quality remains necessary even when the reading is displayed.

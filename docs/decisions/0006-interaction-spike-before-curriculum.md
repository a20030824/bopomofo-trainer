# ADR 0006: Validate interaction timing before finalizing curriculum metrics

## Status

Accepted

## Context

A headless curriculum simulator can verify coverage, repetition, and sampling behavior, but it cannot determine whether guided Bopomofo presentation feels natural or which timing boundaries contain usable motor information.

Important unanswered questions include:

- whether first-tone Space feels coherent in continuous practice;
- how much delay appears at exercise, word, and syllable boundaries;
- how error correction changes the next latency sample;
- whether one-word exercises create excessive visual and cognitive resets;
- whether raw `KeyboardEvent.code` handling behaves consistently in the target browser workflow.

## Decision

The first executable artifact is a disposable human-operated interaction spike. It records raw, context-rich observations but does not assign permanent progress or adaptive scores.

The deterministic curriculum simulator follows after the spike establishes a defensible timing and error policy.

## Consequences

- A small temporary web page is allowed before a product UI framework is chosen.
- The spike may be replaced rather than evolved into production code.
- Measurement rules must be justified by traces, not only by analogy to Keybr.
- Curriculum work begins with fewer hidden assumptions and more credible synthetic profiles.

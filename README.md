# Bopomofo Trainer

A lightweight, local-first experiment for adaptive Bopomofo practice.

The project uses Chinese words as prompts, represents the expected answer as semantic Bopomofo and tone tokens, and maps physical keyboard input through a selectable layout. The first target is Taiwan Standard Bopomofo, but the core model is intentionally independent of UI frameworks and physical key layouts.

## Current status

Architecture baseline only. There is no practice UI yet.

## Principles

- Semantic Bopomofo tokens are not physical keys.
- Every syllable ends with an explicit tone token, including first tone.
- Curriculum logic, input sessions, metrics, datasets, and UI remain separate.
- Start with a small modular TypeScript core; add infrastructure only when needed.
- Learn from Keybr's focused-token loop without copying its code or product scale.

## Documents

- [Vision](docs/vision.md)
- [Domain model](docs/domain-model.md)
- [Architecture](docs/architecture.md)
- [Keybr reference](docs/keybr-reference.md)
- [Roadmap](docs/roadmap.md)
- [Architecture decisions](docs/decisions/)

## Proposed first executable milestone

A headless curriculum simulator that can:

1. load a small reviewed word catalog;
2. select a focused weak token from a synthetic learner profile;
3. sample common words containing that token;
4. report coverage, repetition, and frequency-band balance.

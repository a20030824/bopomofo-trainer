# Bopomofo Trainer

A lightweight, local-first experiment for guided and adaptive Bopomofo keyboard practice.

The first product shows Traditional Chinese context together with the complete Bopomofo and tone sequence, then measures how fluently the learner maps those visible semantic tokens to Taiwan Standard Bopomofo physical keys. Reading recall is treated as a separate future practice mode rather than being mixed into motor timing.

## Current status

Architecture baseline only. There is no product practice UI yet.

## Principles

- Semantic Bopomofo tokens are not physical keys.
- Every syllable ends with an explicit tone token, including first tone.
- V1 is guided practice: Chinese context and complete Bopomofo are visible.
- Motor skill statistics are scoped by practice mode, layout, and token.
- Catalog entries are content units; exercises may contain several entries.
- Curriculum logic, sessions, measurement, datasets, and UI remain separate.
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

A disposable human-operated interaction spike that can:

1. show Chinese context and complete visible Bopomofo readings;
2. accept Taiwan Standard Bopomofo physical keys in English keyboard mode;
3. handle all five tones, including first-tone Space;
4. run several catalog entries as one continuous exercise;
5. expose raw timing and error traces without prematurely assigning permanent progress scores.

A deterministic curriculum simulator follows after the interaction spike establishes credible measurement semantics.

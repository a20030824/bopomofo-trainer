# Bopomofo Trainer

A lightweight, local-first experiment for guided and adaptive Bopomofo keyboard practice.

The first product shows Traditional Chinese context together with the complete Bopomofo and tone sequence, then measures how fluently the learner maps those visible semantic tokens to Taiwan Standard Bopomofo physical keys. Reading recall is treated as a separate future practice mode rather than being mixed into motor timing.

## Current status

The architecture baseline, catalog compiler, guided interaction spike, and Phase 3 measurement model are complete. Phase 4 adds a deterministic headless curriculum simulator for baseline coverage, eligibility, focused binding selection, and continuous exercise generation. It still does not create a validated confidence score, persistent learner profile, or production adaptive UI.

## Run the spike

```bash
npm install
npm run dev
```

Then open the Vite URL, switch the operating system to English keyboard mode, and type the visible Bopomofo sequence. Space is the explicit first-tone key.

Useful commands:

```bash
npm run check
npm run build
npm run preview
```

The spike keeps traces in memory only. It can display or download JSON but does not create learner confidence or persistent progress.

Analyze a downloaded trace with the Phase 3 policy:

```bash
npm run measurement:analyze -- path/to/bopomofo-spike.json
```

Run the Phase 4 synthetic curriculum scenarios:

```bash
npm run curriculum:simulate
npm run curriculum:simulate -- --seed review --rounds 20
```

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
- [Interaction spike](docs/interaction-spike.md)
- [Measurement policy](docs/measurement-policy.md)
- [Curriculum simulator](docs/curriculum-simulator.md)
- [Architecture decisions](docs/decisions/)

## Validated interaction and simulation milestones

The disposable browser spike can:

1. show Chinese context and complete visible Bopomofo readings;
2. accept Taiwan Standard Bopomofo physical keys through `KeyboardEvent.code`;
3. handle all five tones, including first-tone Space;
4. run several catalog entries as one continuous exercise;
5. distinguish errors, recovery, unmapped keys, repeats, modifiers, and composition;
6. expose raw timing traces without prematurely assigning permanent progress scores.

The Phase 3 model keeps boundary, recovery, and interaction-noise intervals separate from eligible within-syllable motor timing. The Phase 4 simulator then tests coverage and focused selection with explicit states, catalog-support gates, seeded weighted sampling, and inspectable reports before those rules are connected to a product UI.

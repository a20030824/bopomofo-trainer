# Bopomofo Trainer

A local-first experiment for guided, adaptive Bopomofo keyboard practice.

The product shows Traditional Chinese context together with the complete Bopomofo and tone sequence. The learner presses physical keys in English keyboard mode; Space is the explicit first-tone key. Reading recall remains a separate future practice mode rather than being mixed into motor timing.

## Current status

Phases 0–4 established the domain model, validated catalog compiler, browser interaction semantics, versioned measurement policy, and deterministic curriculum simulator. Phase 5 connected those parts into a thin usable product. Phase 6A adds local pilot instrumentation without changing the curriculum policy:

- curriculum-generated six-entry guided exercises;
- cumulative Phase 3 measurement across completed rounds;
- coverage, focus, and cooldown from Phase 4;
- schema-versioned progress in browser `localStorage`;
- a held-out evaluation round after every five completed practice rounds;
- separate evaluation summaries that never update adaptive training aggregates;
- a compact completion summary and inspectable raw diagnostics;
- a separate 24-round local pilot history with mapped-key accuracy, focus, timing-sample count, and median clean latency;
- deterministic pilot JSON export with no account, browser identifier, upload, or effectiveness claim.

The UI remains Vanilla TypeScript + Vite. The current single-page interaction does not justify a framework migration.

## Run

```bash
npm install
npm run dev
```

Open the Vite URL, switch the operating system to English keyboard mode, and type the visible Bopomofo sequence.

Useful commands:

```bash
npm run check
npm run build
npm run curriculum:simulate
npm run measurement:analyze -- path/to/bopomofo-round.json
```

The browser saves guided, `zhuyin-standard` progress locally after each completed round. It also stores pilot history under a separate schema-versioned key so valid Phase 5 progress does not need to be rewritten. “清除本機進度” removes progress and pilot history. There is no account, backend, cloud synchronization, telemetry upload, or validated confidence/mastery score.

## Principles

- Semantic Bopomofo tokens are not physical keys.
- Every syllable ends with an explicit tone token, including first tone.
- V1 is guided practice: Chinese context and complete Bopomofo are visible.
- Motor statistics are scoped by practice mode, layout, and token.
- Catalog entries are content units; exercises contain several entries.
- Boundary, recovery, and interaction-noise timing remain separate from clean motor timing.
- Evaluation vocabulary is held out from adaptive practice and does not update curriculum state.
- Pilot history is observational evidence, not a mastery or learning-effectiveness claim.
- Curriculum, measurement, persistence, pilot instrumentation, and browser adapters remain separate modules.

## Documents

- [Vision](docs/vision.md)
- [Domain model](docs/domain-model.md)
- [Architecture](docs/architecture.md)
- [Roadmap](docs/roadmap.md)
- [Interaction spike](docs/interaction-spike.md)
- [Measurement policy](docs/measurement-policy.md)
- [Curriculum simulator](docs/curriculum-simulator.md)
- [Thin product prototype](docs/thin-product-prototype.md)
- [Pilot validation](docs/pilot-validation.md)
- [Architecture decisions](docs/decisions/)

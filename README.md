# Bopomofo Trainer

A local-first Bopomofo keyboard trainer that presents reviewed Traditional Chinese utterances and adapts their selection without hiding the underlying evidence.

## Product direction

The browser now follows one deliberately simple policy:

1. common vocabulary determines the initial practice pool;
2. lower-frequency vocabulary unlocks gradually;
3. formal syntax profiles derive a sentence shape and fill only compatible lexical slots;
4. expected-token errors and clean timing add only bounded weight;
5. exact within-syllable transition latency may raise candidates containing that ordered transition;
6. the actual wrong token and directional confusion aggregate do not affect curriculum selection;
7. held-out evaluation remains separate and never updates training state.

A round is one grammar-valid utterance, not six independently sampled words. The meaning may occasionally be unusual, but every candidate must be realized from the formal Mandarin grammar and compatible observed syntax profiles. Product selection has no template, standalone, or arbitrary word-list fallback.

## Evidence model

Bopomofo practice retains several linked structures:

1. Chinese context and reviewed pronunciation;
2. semantic Bopomofo token paths;
3. layout-specific symbol-to-key bindings;
4. directional within-syllable key transitions;
5. directional expected-to-actual confusions.

These channels remain separate:

- binding correctness updates the expected token;
- accepted binding timing may add a capped token boost;
- clean adjacent timing belongs to an exact transition edge;
- confusion observations remain diagnostic and exportable, but do not raise the actual wrong token or create a curriculum target.

## Current product status

The product includes:

- validated Bopomofo readings, provenance, and a 1,786-entry reviewed catalog;
- manifest-linked lexicon generations in disposable, Git-ignored workspaces;
- a fail-closed formal-syntax legality allowlist and compact runtime profiles for the active catalog;
- sentence-shape derivation followed by compatible, weighted lexical-slot realization;
- frequency stages 1–3 with conservative unlock gates;
- frequency-dominant utterance scoring with capped learner evidence;
- deterministic seeded selection and recent entry/utterance penalties;
- guided keyboard interaction and context-aware raw traces;
- versioned binding, transition, and confusion aggregation;
- generation-scoped local progress with obsolete-key deletion and no legacy migration;
- grammar-valid held-out evaluation;
- local pilot history, diagnostics, and deterministic export.

Run the browser with:

```bash
npm ci
npm run dev
```

## Research archive

Phase 7 built a deterministic relational research environment:

- exact binding/transition catalog indexing and support reports;
- deterministic external reference importing into a manual review queue;
- relation-preserving partitions and budgeted composers;
- latent relational learners that emit ordinary interaction traces;
- a four-axis strategy matrix;
- seeded cohort experiments, analysis, and targeted confirmation.

The factorial cohort executed 750 runs / 1,500 rounds. Candidate confirmation executed 770 runs / 6,160 rounds. Neither candidate survived its anchor scenario, so no experimental objective/composer combination was promoted as the product strategy.

Those results remain reproducible comparison evidence. They do not block the browser product, and simulation is not treated as proof of human learning effectiveness.

## Commands

```bash
npm install
npm run check
npm run build
npm run integration:research
npm run strategy:matrix
npm run experiment:relational
npm run analysis:relational
npm run confirmation:relational
npm run curriculum:simulate
npm run measurement:analyze -- path/to/bopomofo-round.json
```

- `npm run check` runs typecheck, tests, catalog validation, and production build.
- `npm run integration:research` verifies the single-policy cross-module fixture twice.
- `npm run strategy:matrix` verifies the complete declaration matrix and digest.
- `npm run experiment:relational` reproduces the committed factorial cohort.
- `npm run analysis:relational` reproduces the canonical strategy findings.
- `npm run confirmation:relational` reproduces the extended candidate stress test.

## Principles

- Semantic tokens are not physical keys.
- Syllables and catalog entries are ordered paths, not unordered token sets.
- Frequency determines eligibility and the dominant selection base.
- Learner-specific boosts are sample-gated, explainable, and capped.
- A locked frequency stage cannot be bypassed by a weakness score.
- The actual wrong token does not receive curriculum weight.
- Exact transitions never cross syllable or entry boundaries.
- Grammar validity is established before scoring.
- Formulaic utterances cannot occupy ordinary sentence slots.
- Held-out text never updates training estimates or stage state.
- External reference candidates stop at a manual review queue.
- Simulation can validate internal behavior and replayability, not human effectiveness.

## Documents

- [Vision](docs/vision.md)
- [Domain model](docs/domain-model.md)
- [Architecture](docs/architecture.md)
- [Roadmap](docs/roadmap.md)
- [Grammar-aware practice composition](docs/grammar-aware-practice.md)
- [Frequency-first utterance policy](docs/frequency-first-utterance-policy.md)
- [Measurement policy](docs/measurement-policy.md)
- [Existing product prototype history](docs/archive/thin-product-prototype.md)
- [Pilot instrumentation](docs/pilot-validation.md)
- [Relational skill model](docs/archive/relational-skill-model.md)
- [Relational strategy findings](docs/archive/research/strategy-findings.md)
- [Relational strategy confirmation](docs/archive/research/strategy-confirmation.md)
- [Architecture decisions](docs/decisions/)

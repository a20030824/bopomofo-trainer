# Bopomofo Trainer

A deterministic research environment for studying how Traditional Chinese text can expose and train Bopomofo keyboard relations.

## Research thesis

Bopomofo practice contains several linked structures that must not be collapsed into a flat key sequence:

1. Chinese context and reviewed pronunciation;
2. semantic Bopomofo token paths;
3. layout-specific symbol-to-key bindings;
4. directional within-syllable key transitions;
5. directional expected-to-actual confusions.

The main problem is to organize text data around those relations, estimate learner state from traces, and compare curriculum and content-composition strategies using synthetic learners with known latent truth.

The browser is an existing observation adapter. It is not the current research priority and does not define the curriculum architecture.

## Current status

Phases 0–6 produced useful infrastructure:

- validated Bopomofo readings, provenance, and a 49-entry provisional catalog;
- a guided keyboard interaction and context-aware raw traces;
- versioned binding, transition, and confusion aggregation;
- a deterministic binding-only curriculum baseline;
- a local-first browser adapter, held-out evaluation, and pilot diagnostics.

The current phase reframes that work around relational modeling and headless numeric simulation:

- binding nodes, transition edges, confusion edges, and ordered catalog paths;
- exact relation-support analysis for every text entry;
- synthetic learners that emit ordinary measurement traces;
- independent objective-selection and text-composition policies;
- variable-length practice sequences instead of a fixed six-word round;
- seeded cohort experiments comparing relational strategies.

The existing timed-binding score is retained as a historical baseline. Clean within-syllable inter-key latency is treated primarily as transition-edge evidence, not an independently identifiable destination-token speed.

## Existing commands

```bash
npm install
npm run check
npm run build
npm run curriculum:simulate
npm run measurement:analyze -- path/to/bopomofo-round.json
```

The browser can still be run with `npm run dev`, but further UI work is deferred until the relational catalog, synthetic learner, strategy matrix, and experiment reports are coherent.

## Principles

- Semantic tokens are not physical keys.
- Syllables and catalog entries are ordered paths, not unordered token sets.
- Binding correctness, transition latency, and directional confusion are separate evidence.
- Physical codes belong to layouts and traces, never semantic catalog readings.
- Objective selection and text composition are independent experimental policies.
- Sequence length is determined by evidence and cost budgets, not a fixed word count.
- Held-out text never updates training estimates.
- Simulation can validate internal behavior, identifiability, and strategy differences; it cannot prove human learning effectiveness.
- UI, persistence, measurement, relational indexing, curriculum, composition, and simulation remain separate modules.

## Documents

- [Vision](docs/vision.md)
- [Domain model](docs/domain-model.md)
- [Architecture](docs/architecture.md)
- [Roadmap](docs/roadmap.md)
- [Relational skill model](docs/relational-skill-model.md)
- [Content retrieval and composition](docs/content-retrieval-and-composition.md)
- [Measurement policy](docs/measurement-policy.md)
- [Binding-only curriculum baseline](docs/curriculum-simulator.md)
- [Existing browser adapter](docs/thin-product-prototype.md)
- [Pilot instrumentation](docs/pilot-validation.md)
- [Architecture decisions](docs/decisions/)

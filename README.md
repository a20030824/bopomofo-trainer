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

Phase 7 now has independently tested relational modules for:

- exact binding/transition catalog indexing and support reports;
- deterministic external reference importing into a manual review queue;
- relation-preserving training/evaluation partition policies;
- exact retrieval and budgeted variable-length practice composition;
- latent relational learners that emit ordinary interaction traces;
- Phase 3-backed estimates, estimation-error reports, and deterministic replay.

The integration fixture connects those modules without automatically approving reference candidates. The relational strategy matrix now declares four independently replaceable axes—objective selector, partition policy, composer, and learner model—and the complete 125-cell comparison space. It deliberately does not execute seeds, scenarios, cohorts, or statistical reports; those belong to the next experiment-harness phase.

The existing timed-binding score is retained as a historical baseline. Clean within-syllable inter-key latency is treated primarily as transition-edge evidence, not an independently identifiable destination-token speed.

## Existing commands

```bash
npm install
npm run check
npm run build
npm run integration:research
npm run strategy:matrix
npm run curriculum:simulate
npm run measurement:analyze -- path/to/bopomofo-round.json
```

`npm run integration:research` runs the committed cross-module fixture twice and requires byte-for-byte identical reports.

`npm run strategy:matrix` verifies canonical ordering and the deterministic digest for the complete declaration matrix.

The browser can still be run with `npm run dev`, but further UI work is deferred until the experiment harness and numeric reports are coherent.

## Principles

- Semantic tokens are not physical keys.
- Syllables and catalog entries are ordered paths, not unordered token sets.
- Binding correctness, transition latency, and directional confusion are separate evidence.
- Physical codes belong to layouts and traces, never semantic catalog readings.
- Objective selection, partitioning, text composition, and learner modeling are independent experimental axes.
- Sequence length is determined by evidence and cost budgets, not a fixed word count.
- Held-out text never updates training estimates.
- External reference candidates stop at a manual review queue; they never enter the reviewed catalog automatically.
- Simulation can validate internal behavior, identifiability, and strategy differences; it cannot prove human learning effectiveness.
- UI, persistence, measurement, relational indexing, curriculum, composition, simulation, integration, and experiment declarations remain separate modules.

## Documents

- [Vision](docs/vision.md)
- [Domain model](docs/domain-model.md)
- [Architecture](docs/architecture.md)
- [Roadmap](docs/roadmap.md)
- [Relational skill model](docs/relational-skill-model.md)
- [Content retrieval and composition](docs/content-retrieval-and-composition.md)
- [Relational research integration](docs/relational-research-integration.md)
- [Relational strategy matrix](docs/research/strategy-matrix.md)
- [Measurement policy](docs/measurement-policy.md)
- [Binding-only curriculum baseline](docs/curriculum-simulator.md)
- [Existing browser adapter](docs/thin-product-prototype.md)
- [Pilot instrumentation](docs/pilot-validation.md)
- [Architecture decisions](docs/decisions/)

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

Phase 7 now includes:

- exact binding/transition catalog indexing and support reports;
- deterministic external reference importing into a manual review queue;
- relation-preserving training/evaluation partition policies;
- exact retrieval and budgeted variable-length practice composition;
- latent relational learners that emit ordinary interaction traces;
- Phase 3-backed estimates, estimation-error reports, and deterministic replay;
- a deterministic four-axis strategy matrix;
- a seeded cohort experiment harness with local failure/fallback accounting;
- a versioned analysis layer with fixed-baseline comparisons, balanced axis summaries, failure/fallback clusters, and reproducible findings;
- a targeted candidate-confirmation harness with per-seed decisions, per-round trajectories, matched composer ablations, anchor scenarios, and byte-for-byte findings verification.

The committed factorial cohort executes all 125 objective/partition/composer/learner cells across three synthetic learner scenarios, two seeds, and two adaptive rounds: 750 runs and 1,500 rounds. Objective selectors observe cumulative Phase 3 measurements and catalog support, never hidden learner truth. Metrics that are not identifiable remain `null` with an explicit reason.

The canonical Phase 7G analysis found no failed or zero-execution cell after repairing partition validation for declared confusion pools. Under the versioned `phase-7g-v2` guardrails, two cell/scenario combinations were policy-compatible candidates, five were inconclusive, and 368 were rejected. Those candidates were follow-up targets, not production recommendations.

Phase 7H then challenged the historical baseline, both candidates, six matched composer ablations, and two transition-aware diagnostics across seven scenarios, ten deterministic seeds, and eight adaptive rounds: 770 runs and 6,160 rounds. Under `phase-7h-v2`, neither Phase 7G candidate survived its anchor scenario. All matched composer ablations and transition-aware diagnostic hypotheses were also rejected. The repository therefore selects no product strategy from this cohort; fixed-six is not promoted as a winner, and UI or human-pilot work remains deferred.

The existing timed-binding score is retained as a historical baseline. Clean within-syllable inter-key latency is treated primarily as transition-edge evidence, not an independently identifiable destination-token speed.

## Existing commands

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

- `npm run integration:research` verifies the single-policy cross-module fixture twice.
- `npm run strategy:matrix` verifies the complete declaration matrix and digest.
- `npm run experiment:relational` executes the full committed factorial cohort twice and requires byte-for-byte identical JSON, CSV, and Markdown outputs.
- `npm run analysis:relational` reproduces the factorial analysis outputs and requires the committed strategy findings to match byte-for-byte.
- `npm run confirmation:relational` executes the targeted extended cohort twice, verifies JSON and all CSV/Markdown artifacts byte-for-byte, and requires the committed confirmation findings to match.

The browser can still be run with `npm run dev`, but further UI work is deferred. The next research decision must address the identified catalog-support, measurement-identifiability, concentration, and sustained-improvement limitations before proposing another strategy or browser experiment.

## Principles

- Semantic tokens are not physical keys.
- Syllables and catalog entries are ordered paths, not unordered token sets.
- Binding correctness, transition latency, and directional confusion are separate evidence.
- Physical codes belong to layouts and traces, never semantic catalog readings.
- Objective selection, partitioning, text composition, and learner modeling are independent experimental axes.
- Sequence length is determined by evidence and cost budgets, not a fixed word count.
- Held-out text never updates training estimates.
- External reference candidates stop at a manual review queue; they never enter the reviewed catalog automatically.
- Unsupported or failed matrix cells remain in reports; failure rates cannot be improved by silently dropping runs.
- Bootstrap fallbacks remain visible but are separated from blocking fallbacks by a versioned analysis policy.
- Confirmation decisions preserve every seed, anchor scenario, matched reference, and material trajectory reversal.
- Simulation can validate internal behavior, identifiability, replayability, and strategy differences; it cannot prove human learning effectiveness.
- UI, persistence, measurement, relational indexing, curriculum, composition, simulation, integration, experiment reporting, findings analysis, and candidate confirmation remain separate modules.

## Documents

- [Vision](docs/vision.md)
- [Domain model](docs/domain-model.md)
- [Architecture](docs/architecture.md)
- [Roadmap](docs/roadmap.md)
- [Relational skill model](docs/relational-skill-model.md)
- [Content retrieval and composition](docs/content-retrieval-and-composition.md)
- [Relational research integration](docs/relational-research-integration.md)
- [Relational strategy matrix](docs/research/strategy-matrix.md)
- [Relational experiment harness](docs/research/experiment-harness.md)
- [Relational strategy findings](docs/research/strategy-findings.md)
- [Relational strategy confirmation](docs/research/strategy-confirmation.md)
- [Measurement policy](docs/measurement-policy.md)
- [Binding-only curriculum baseline](docs/curriculum-simulator.md)
- [Existing browser adapter](docs/thin-product-prototype.md)
- [Pilot instrumentation](docs/pilot-validation.md)
- [Architecture decisions](docs/decisions/)

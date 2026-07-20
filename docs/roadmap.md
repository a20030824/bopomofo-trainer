# Roadmap

## Completed foundation

### Phase 0 — Architecture baseline

Separated Chinese context, semantic Bopomofo tokens, physical layouts, guided/recall modes, catalog entries, and exercises.

### Phase 1 — Scheme and catalog feasibility

Implemented explicit tones, legal syllable parsing, provenance, validation, and a 49-entry provisional catalog.

### Phase 2 — Interaction spike

Validated Taiwan Standard physical input, first-tone Space, boundaries, errors, recovery, and raw trace semantics.

### Phase 3 — Measurement baseline

Implemented deterministic binding, confusion, and transition observations with explicit boundary, recovery, and noise exclusions.

### Phase 4 — Binding-only curriculum baseline

Implemented coverage, eligibility, cooldown, seeded weighted sampling, and a fixed six-entry builder. This remains a comparison baseline, not the final relational curriculum.

### Phases 5–6 — Existing adapters

Connected the baseline to a local browser product, held-out evaluation, persistence, pilot history, export, and a clearer interface. These remain useful observation and diagnostic adapters. They do not define the current research priority.

## Current research phase

# Phase 7 — Relational catalog and synthetic curriculum experiments

Human pilot and further UI work are paused until Phase 7 is coherent.

## Phase 7A — Research reframing and semantic contracts

Goal: make binding nodes, transition edges, confusion edges, and ordered catalog paths first-class.

Deliverables:

- corrected README, vision, architecture, domain language, and roadmap;
- clean evidence assignment: binding correctness, directional confusion, and transition latency;
- explicit statement that timed destination-token binding is a historical proxy;
- relation-objective, content-query, and variable-length practice-sequence contracts;
- fixed-six retained only as a baseline.

Exit condition: the repository can explain what relation is selected, what text occurrence supports it, why a sequence has its length, and which evidence updates each estimate.

## Phase 7B — Relational catalog analysis

Goal: understand what the current text data can and cannot train before adding more words.

Deliverables:

- exact binding occurrences by entry, syllable, and token position;
- exact directional transition occurrences by entry and syllable;
- frequency, provenance, tag, occurrence, and distinct-entry support reports;
- entry and lexical-family concentration metrics;
- held-out support-loss checks;
- possible expected/actual contrast pools for confusion objectives;
- explicit unsupported, rare-only, and weakly supported relation lists;
- deterministic external-reference importing into a structured manual review queue;
- relation-support-preserving partition policies with constraints, fallbacks, and metrics.

Exit condition: catalog blind spots are numeric and traceable, expansion requests can name the missing relations they are meant to cover, and evaluation partitions do not silently remove required training support.

## Phase 7C — Synthetic learner and trace generator

Goal: generate ordinary Phase 3-compatible traces from known latent relational skill.

Deliverables:

- binding correctness parameters;
- directional confusion matrices;
- directional transition latency distributions;
- relation-specific improvement rates;
- separate boundary, noise, recovery, and session-drift parameters;
- deterministic trace generation through a real layout;
- ground-truth snapshots before and after each sequence;
- explicit transfer and retention semantics with duplicate-transfer validation.

Exit condition: identical seeds are byte-for-byte reproducible and estimators can be scored against hidden truth.

## Phase 7D — Objective and composition strategies

Goal: compare weakness selection separately from text construction.

Objective policies:

1. frequency-weighted random;
2. binding-only baseline;
3. transition-aware;
4. confusion-aware;
5. combined relational.

Composition policies:

1. fixed-six baseline;
2. greedy marginal gain;
3. greedy gain per token;
4. diversity-aware greedy;
5. bounded beam search.

The canonical output is variable length and budgeted by target exposures, tokens, syllables, boundaries, lexical quality, repetition, and concentration. Every retrieval exclusion, candidate rejection, stop, and fallback is explicit.

Exit condition: any objective/composer combination exposes its selected relation, exact supporting occurrences, candidate costs, ordered items, sequence length, and stop reason.

## Phase 7 integration checkpoint

Goal: prove the independently developed Phase 7 modules connect without weakening their boundaries.

The deterministic integration fixture verifies:

1. source bytes → importer → normalized candidates/errors → relational review queue;
2. reviewed catalog → relational report → relation-preserving partition → explicit constraints and metrics;
3. partitioned relation index → exact retrieval → variable-length `PracticeSequence` → selection/stop trace;
4. practice sequence → synthetic learner → ordinary `InteractionTrace` → existing Phase 3 measurement → estimation error;
5. identical fixtures, versions, policies, seeds, scenario, and timestamp → byte-for-byte identical complete report.

The reference path stops at `manual-review-required`; it never mutates the reviewed catalog. This checkpoint uses one fixed objective, partition, composer, and learner scenario only. It does not implement the strategy matrix.

Exit condition: `npm run integration:research` and the integration regressions pass on the exact PR head.

## Phase 7E — Seeded cohort experiments

Goal: compare replaceable strategies numerically across controlled learner scenarios.

Required scenarios:

- one weak binding;
- one weak transition with strong component bindings;
- asymmetric confusion;
- competing binding and transition weaknesses;
- rare unsupported relation;
- heterogeneous improvement rates;
- noisy and boundary-heavy learners;
- multiple seeds and learner cohorts.

Reports include:

- node and edge coverage;
- estimation error against latent truth;
- weakness-identification delay;
- target exposure lift over baseline;
- held-out path performance;
- confusion reduction;
- sequence-length distribution;
- frequency and lexical diversity;
- repetition and concentration;
- unsupported and fallback rates;
- stability across seeds.

Exit condition: strategy differences are reproducible, explainable, and not artifacts of one fixed word count or one word picker.

## After Phase 7

Only after reviewing the relational architecture and numeric reports should the project decide:

- which catalog relations require more real words;
- which estimator and strategy deserve browser integration;
- how a variable-length sequence is presented to a person;
- whether auto-advance or round boundaries still make sense;
- what limited human experiment is needed to challenge simulation assumptions.

Recall mode, alternate layouts, accounts, cloud sync, and further product refinement remain deferred.

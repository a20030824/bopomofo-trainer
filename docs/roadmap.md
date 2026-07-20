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

Human pilot and further UI work are paused until the synthetic findings are challenged with broader evidence.

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
- directional expected/actual contrast pools for confusion objectives;
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

The reference path stops at `manual-review-required`; it never mutates the reviewed catalog. This checkpoint uses one fixed objective, partition, composer, and learner scenario only.

Exit condition: `npm run integration:research` and the integration regressions pass on the exact PR head.

## Phase 7E — Relational strategy matrix

Goal: declare the complete replaceable comparison space without hard-coding one simulator or prematurely executing experiments.

Replaceable axes:

1. objective selector;
2. partition policy;
3. practice composer;
4. learner model.

The initial declaration contains:

- five objective strategies;
- five partition policies;
- five composition strategies;
- one current synthetic learner model;
- 125 deterministic matrix cells;
- one explicit historical binding/fixed-six baseline cell;
- stable cell IDs, canonical axis ordering, and a matrix digest;
- adapter interfaces for every axis.

Matrix cells contain strategy identities only. They do not contain seeds, scenarios, cohorts, rounds, metrics, confidence intervals, or result status.

Exit condition: `npm run strategy:matrix` is input-order invariant, every declared combination appears exactly once, the baseline cannot be silently removed, and all four axes are represented in the experiment contract.

## Phase 7F — Seeded cohort experiment harness

Goal: execute matrix cells numerically across controlled learner scenarios.

Implemented deliverables:

- executable adapters for all five objective selectors, five partition policies, five composers, and the current learner model;
- production directional confusion contrast pools included in canonical relational-report digests;
- deterministic cell/scenario/seed/round execution with stage-specific derived seeds;
- cumulative Phase 3 measurement and current pre-exposure latent-error comparison;
- local partition, objective, composition, and learner failure records;
- explicit null reasons for metrics that are not identifiable;
- aggregate sample counts, missing counts, means, sample standard deviations, and descriptive 95% intervals;
- canonical JSON, aggregate CSV, and Markdown reports;
- byte-for-byte replay of the committed cohort.

The committed cohort runs:

```text
125 strategy cells
× 3 learner scenarios
× 2 seeds
= 750 runs
× 2 rounds
= 1,500 rounds
```

Reported metrics include:

- relation coverage;
- cumulative estimation error against latent truth;
- weakness-identification delay;
- target exposure per token;
- explicit transfer proxy when identifiable;
- confusion reduction;
- lexical concentration and repetition;
- fallback and failure rates;
- token cost per normalized latent improvement;
- descriptive stability across seeds and cohorts.

Exit condition: `npm run experiment:relational` reproduces JSON, CSV, and Markdown byte-for-byte; failed cells remain in the report; evaluation entries never update learner measurements; and objective selectors never receive hidden truth.

## Phase 7G — Report interpretation and strategy candidates

Goal: interpret the complete factorial report without inventing a single score or silently dropping failed, null, or contradictory evidence.

Implemented deliverables:

- matrix-declared baseline comparisons within each scenario;
- explicit metric directions, roles, material thresholds, and candidate guardrails;
- separate total fallback and versioned blocking-fallback rates;
- balanced objective, partition, composer, and learner axis summaries;
- global, scenario, cell, and axis failure/fallback clusters;
- conservative `candidate`, `inconclusive`, and `rejected` classifications;
- JSON, cell-comparison CSV, axis-summary CSV, and canonical Markdown findings;
- byte-for-byte verification of the committed findings document.

The first analysis exposed and repaired a Phase 7F source-contract defect: partition validation reconstructed reports without their declared confusion pools, causing every run to fail before execution. After the fix, all 375 cell/scenario groups have executable rounds and no failure cluster.

Under policy `phase-7g-v2`, the committed cohort yields:

- 2 policy-compatible candidate cell/scenario combinations;
- 5 inconclusive combinations;
- 368 rejected combinations;
- 0 zero-execution combinations;
- 0 recorded failure clusters.

The two candidates are:

1. asymmetric confusion: frequency-random objective, binding-preserving partition, fixed-six composer;
2. weak binding: binding-only objective, relation-support-preserving partition, fixed-six composer.

They are follow-up targets, not production winners. A frequency-stratified asymmetric-confusion combination was explicitly kept inconclusive because faster weakness identification coincided with materially worse confusion-estimation error.

Exit condition: `npm run analysis:relational` reproduces the analysis artifacts and verifies `docs/research/strategy-findings.md` byte-for-byte; baseline identity cannot drift; axis groups remain balanced; contradictory primary evidence cannot be labeled a candidate.

## Next research checkpoint — challenge candidate evidence

Before resuming product work:

- rerun the two candidates with more seeds and more than two adaptive rounds;
- add competing-weakness, noisy, retention, and heterogeneous-improvement scenarios;
- verify whether fixed-six is genuinely robust or only advantaged by the small committed catalog and budget;
- inspect why transition-aware shows zero blocking fallback but produces no current candidate;
- decide whether catalog support or measurement identifiability must improve before strategy selection;
- define a limited browser adapter experiment only after the synthetic result survives these challenges.

Recall mode, alternate layouts, accounts, cloud sync, PR #18 auto-advance, human pilot, and further product refinement remain deferred.

# Relational experiment harness

## Purpose

The Phase 7F harness executes the declared relational strategy matrix across deterministic synthetic learner cohorts. It compares objective selection, partitioning, practice composition, and learner models without coupling those four axes to one simulator implementation.

Simulation can test internal consistency, estimator behavior, replayability, failure handling, and strategy differences. It does not establish human learning effectiveness.

## Executable axes

The default matrix executes:

- five objective selectors;
- five partition policies;
- five practice composers;
- `synthetic-relational-v1`.

The historical baseline remains the binding-only selector, binding-preserving partition, fixed-six composer, and current synthetic learner model.

## Objective information boundary

Objective selectors receive only:

- cumulative Phase 3 `MeasurementSummary`;
- the partitioned relational catalog report;
- recent objective history;
- round, mode, and layout scope;
- a seeded random source.

They never receive latent learner truth. Hidden truth is used only after objective selection to calculate evaluator metrics such as weakness-identification delay and estimation error.

When no measurement exists at round zero, selectors use an explicit support-driven fallback. They do not pretend to know the learner's weakness.

## Production confusion pools

Confusion-aware execution uses production `CatalogRelationIndex.confusionContrastPools`, not test-only indexes.

The canonical relational report accepts declared directional expected/actual pairs and records deterministic:

- expected-token entry IDs;
- actual-token entry IDs;
- shared entry IDs.

The pools are included in the report digest. They contain lexical support only; confusion probability remains learner/measurement data.

## Run loop

For each matrix cell, learner scenario, and seed:

1. build an all-training relational report;
2. execute the selected partition policy with explicit options and seed;
3. rebuild the report with the resulting training/evaluation partition;
4. select an objective from cumulative measurement and support;
5. compose a budgeted sequence while excluding evaluation occurrences;
6. emit ordinary interaction traces through the learner adapter;
7. update cumulative Phase 3 aggregates;
8. compare cumulative estimates with the current pre-exposure latent state;
9. update latent learner state;
10. record decisions, fallbacks, failures, metrics, and digests.

A failure in one stage is recorded locally. It does not abort the remaining matrix cells.

## Deterministic dimensions

The plan declares:

- strategy matrix subset or full matrix;
- reviewed synthetic catalog;
- directional confusion relations;
- learner scenarios;
- seeds;
- number of rounds;
- partition options;
- practice budget and beam width;
- fixed initial timestamp and per-round step.

Catalog entries, scenarios, seeds, confusion declarations, cells, runs, aggregates, and report fields use canonical ordering. Stage-specific seeds derive from the plan, cell, scenario, cohort seed, round, and stage name.

## Committed cohort

`data/fixtures/experiment/relational-cohort-v1.json` runs:

```text
125 strategy cells
× 3 learner scenarios
× 2 seeds
= 750 runs
× 2 adaptive rounds
= 1,500 rounds
```

The scenarios are:

- `weak-binding`;
- `weak-transition`;
- `asymmetric-confusion`.

The reviewed fixture catalog provides repeated support for the learner's declared canonical transitions and the directional `zhuyin:ㄅ → zhuyin:ㄆ` confusion contrast.

## Metrics

Per-run metrics include:

- first round selecting a maximal initial latent weakness;
- cumulative binding, transition, and confusion estimation error;
- target exposures per practice token;
- distinct selected relation coverage;
- explicit transfer improvement proxy;
- lexical concentration;
- repeated-entry rate;
- fallback rate;
- failure rate;
- practice-token cost per normalized latent improvement;
- confusion reduction.

A metric that cannot be identified is emitted as `null` with a machine-readable reason. For example, held-out transfer remains null when the learner emits no explicit transfer event.

## Aggregate statistics

Runs are grouped by strategy cell and learner scenario. Each metric reports:

- identifiable sample count;
- missing count;
- mean;
- sample standard deviation when at least two samples exist;
- descriptive normal-approximation 95% interval when at least two samples exist;
- a reason describing identifiability or the interval rule.

These intervals describe seeded synthetic cohort variation. They are not inferential claims about people.

## Outputs

The harness emits:

- canonical JSON with every plan, run, round, trace, estimate, failure, metric, and digest;
- aggregate CSV with one row per cell/scenario/metric;
- Markdown overview with aggregate fallback, failure, weakness-delay, efficiency, and cost metrics.

Run:

```bash
npm run experiment:relational
```

Write all formats:

```bash
npx tsx scripts/run-relational-experiments.ts \
  --verify \
  --output-dir /tmp/bopomofo-relational-experiments
```

`--verify` executes the full committed cohort twice and requires byte-for-byte identical JSON, CSV, and Markdown.

## Failure and fallback accounting

The harness distinguishes:

- partition failure;
- objective-selector failure or no explicit supported demand;
- composition failure or non-executable sequence;
- learner-model failure;
- objective fallback;
- composition fallback.

Unsupported relations are never counted as successful exposure. Unknown extension adapters may fail individual cells, but their records remain present so failure rates cannot be improved by silently dropping failed runs.

## Non-goals

This phase does not:

- approve external reference candidates;
- download official datasets;
- integrate the winning strategy into the browser;
- resume PR #18 or auto-advance work;
- run a human pilot;
- claim that synthetic improvement predicts human learning.

# Architecture

## Style

Use one TypeScript repository and a lightweight modular monolith. Domain logic remains framework-independent. No backend, telemetry, or product framework migration is required for the current research phase.

## Modules

```text
src/
  core/          Semantic types, identities, invariants.
  scheme/        Bopomofo grammar, tokens, physical layouts.
  catalog/       Source parsing, provenance, validation, compiled entries.
  relations/     Ordered occurrence indexes and support analysis.
  practice/      Existing sessions, boundaries, and normalized traces.
  measurement/   Binding, transition, confusion, boundary estimators.
  curriculum/    Objective policies and historical binding-only baseline.
  composition/   Retrieval, candidate costs, ordering, variable sequences.
  simulation/    Synthetic learners, scenarios, cohorts, experiment runner.
  product/       Existing persistence and browser-product coordination.
  app/           Existing browser observation adapter.
```

Directories may be introduced incrementally. Dependency boundaries matter more than exact names.

## Dependency direction

```text
catalog sources
      ↓
catalog compiler → relation index
                         ↓
latent scenario → objective policy → content query
                         ↓              ↓
                    estimator       composer
                         ↑              ↓
                generated traces ← practice sequence
                         ↑
                 synthetic learner
```

The browser follows the same lower path as a trace source, but is not required by simulation.

Rules:

1. semantic catalog paths never contain physical key codes;
2. relation indexing depends on ordered syllable paths, not UI exercises;
3. measurement consumes traces and does not know which strategy selected the text;
4. objective policies do not directly pick entries;
5. composition resolves a query against exact occurrence references;
6. synthetic learners emit normal traces and never expose hidden truth to estimators or curricula;
7. experiment reports may read hidden truth only after a run for evaluation;
8. product and app modules contain no research selection algorithm.

## Evidence flow

For each attempted token:

```text
expected token + actual token
          ↓
binding correctness and directional confusion

previous token + expected token + clean interval
          ↓
directional transition latency

entry/syllable/exercise boundary interval
          ↓
separate boundary evidence
```

The existing destination-token timing aggregate is a historical baseline. New relational estimators must not count one interval as independently identified token speed and transition speed.

## Relational catalog flow

```text
reviewed text and pronunciation
          ↓
ordered syllable paths
          ↓
exact binding and transition occurrences
          ↓
support, frequency, concentration, provenance, partition reports
          ↓
objective-specific candidate retrieval
```

Catalog expansion is driven by measured blind spots. New entries must state which unsupported or concentrated relations they improve.

## Selection pipeline

### Objective policy

Chooses coverage, binding, transition, confusion, or combined demands. It reports scores, eligibility, support, cooldown, and fallback.

### Content query

Translates the objective into target exposures, token/syllable budgets, lexical constraints, repetition limits, and held-out restrictions.

### Composer

Selects and orders exact supporting entries. It reports candidate costs, objective occurrence references, sequence length, and stop reason.

The fixed six-entry builder is retained as one baseline composer only.

## Synthetic experiment flow

1. instantiate latent learner truth and a catalog partition;
2. choose objective and composition strategies;
3. build a practice sequence;
4. generate deterministic traces through the real layout;
5. aggregate measurements;
6. update latent skill using the declared learning model;
7. repeat for requested rounds or exposure budget;
8. compare estimates and outcomes with latent truth;
9. serialize a deterministic report.

## Extension seams

Only explicit experimental seams are preserved:

- layout;
- catalog source and partition;
- relation index version;
- estimator policy;
- objective policy;
- composition policy;
- synthetic learner model;
- experiment metric set;
- optional progress or browser adapter.

## Current artifacts

The interaction spike, local product, pilot history, and auto-advance branch are adapters around already completed work. They are paused while the relational index, synthetic learner, and strategy matrix are designed and tested numerically.

## Deferred

- browser presentation of variable-length sequences;
- additional UI refinement and immediate human pilot;
- recall curriculum;
- alternate layouts;
- accounts, cloud sync, or telemetry;
- claims about real learning effectiveness.

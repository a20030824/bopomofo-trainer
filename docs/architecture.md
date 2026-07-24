# Architecture

## Style

Use one TypeScript repository and a lightweight modular monolith. Domain logic remains framework-independent. No backend, telemetry, or product framework migration is required for the current research phase.

## Modules

```text
src/
  core/          Semantic types, identities, invariants.
  scheme/        Bopomofo grammar, tokens, physical layouts.
  catalog/       Source parsing, provenance, validation, compiled entries.
  reference/     External-source normalization, contribution, manual review queue.
  relations/     Ordered occurrence indexes, support analysis, partitions.
  practice/      Existing sessions, boundaries, and normalized traces.
  measurement/   Binding, transition, confusion, boundary estimators.
  curriculum/    Objective policies and historical binding-only baseline.
  diagnostics/   Pure user-facing projections, data states, and selectors.
  composition/   Retrieval, candidate costs, ordering, variable sequences.
  simulation/    Synthetic learners, trace generation, experiment contracts.
  integration/   Cross-module replay proof; no strategy selection logic.
  product/       Existing persistence and browser-product coordination.
  app/           Existing browser observation adapter and UI.
```

Directories may be introduced incrementally. Dependency boundaries matter more than exact names.

## Dependency direction

```text
external reference bytes → importer → contribution/ranking → manual review queue
                                                    ✕ no automatic approval
reviewed catalog → relation index → partition → objective + composer
                                                   ↓
latent scenario → synthetic learner ← practice sequence
                         ↓
                 ordinary raw traces
                         ↓
                 Phase 3 measurement
                         ↓
             estimate versus hidden truth
```

The browser follows the same trace-to-measurement path as a trace source, but is not required by simulation.

Rules:

1. semantic catalog paths never contain physical key codes;
2. external reference candidates stop at a manual review queue and never mutate the reviewed catalog automatically;
3. relation indexing depends on ordered syllable paths, not UI exercises;
4. partitions expose training/evaluation support loss, constraints, fallbacks, and metrics;
5. measurement consumes traces and does not know which strategy selected the text;
6. objective policies do not directly pick entries;
7. composition resolves an objective against exact occurrence references and excludes evaluation occurrences;
8. synthetic learners emit normal traces and never expose hidden truth to estimators or curricula;
9. experiment reports may read hidden truth only after a run for evaluation;
10. integration code orchestrates public module APIs and does not reimplement importer, partition, composition, learner, or measurement rules;
11. product and app modules contain no research selection algorithm;
12. diagnostics project existing measurements and current product policy into display data, but never mutate learner state or recompute practice selection.

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

External sources follow a separate path:

```text
local source bytes
  → source-specific adapter
  → normalized candidate or structured row error
  → contribution ranking
  → manual review queue
```

Approval into the reviewed catalog remains an explicit human/review workflow outside the importer and integration harness.

## Selection pipeline

### Objective policy

Chooses coverage, binding, transition, confusion, or combined demands. It reports scores, eligibility, support, cooldown, and fallback.

### Partition policy

Chooses evaluation entries while preserving declared training support. It reports every selected/rejected candidate, constraint result, fallback, stability input, and deterministic metrics.

### Composer

Retrieves and orders exact supporting entries under exposure, token, syllable, boundary, common-word, repetition, concentration, and history budgets. It reports candidate costs, occurrence references, sequence length, selection trace, fallback, and stop reason.

The fixed six-entry builder is retained as one baseline composer only.

## Synthetic experiment flow

1. instantiate latent learner truth and a reviewed catalog partition;
2. choose an objective and composition policy;
3. build a variable-length practice sequence from training occurrences;
4. generate deterministic traces through a real layout;
5. aggregate measurements through the existing Phase 3 pipeline;
6. update latent skill using the declared learning model;
7. compare estimates with the pre-exposure hidden truth;
8. serialize deterministic reports.

The integration checkpoint executes one fixed instance of this flow and verifies byte-for-byte replay. Multi-policy, multi-seed, and cohort comparison belongs to the later experiment harness.

## Integration report

The integration module records four connected artifacts without flattening them:

- importer result and manual review queue;
- partition decision and partitioned relational report;
- `PracticeSequence` with retrieval, selection, budget, fallback, and stop data;
- synthetic trace batch with raw traces, Phase 3 measurement, latent updates, estimation error, and digest.

The outer report adds one deterministic digest over the complete canonical structure. The committed fixture is synthetic and does not contain official source rows.

## Extension seams

Only explicit experimental seams are preserved:

- layout;
- external reference adapter and version;
- reviewed catalog source and partition;
- relation index version;
- estimator policy;
- objective policy;
- composition policy;
- synthetic learner model;
- experiment metric set;
- optional progress or browser adapter.

## Current artifacts

The browser product now composes complete grammar-valid utterances from the complete syntax-legal practice catalog, selects them with reviewed commonness plus bounded learner evidence, persists schema-versioned local progress, exports pilot diagnostics, and presents a full-page weakness analysis over binding, transition, and confusion aggregates. The browser does not reserve held-out vocabulary or schedule automatic evaluation rounds. Archived relational importers, partition policies, variable-length composers, synthetic learners, strategy matrices, cohort experiments, and confirmation harnesses remain reproducible research evidence rather than the production selection path.

The data pipeline pins the active-catalog commonness and reading projections.
Lexicon expansion runs in a disposable, manifest-linked generation workspace;
only reviewed catalog mutations and current active-catalog evidence are
committed. Product compilation additionally verifies a compact allowlist
derived from the full formal-syntax rule index and packages only identities
that reach a `Sentence` production. A stale, incomplete, or digest-mismatched
allowlist fails the build. Pronunciation, lexical identity, grammar role,
valency, and provenance remain review-gated before an entry reaches the browser
catalog.

Word meaning and semantics are outside the architecture boundary. Catalog
processing, annotation, composition, selection, validation, and evaluation may
use form, pronunciation records, frequency, morphosyntactic tags, dependency
evidence, surface distribution, valency, and declared formal production rules, but must not
consume or infer definitions, senses, semantic roles, plausibility, world
knowledge, embeddings, language-model judgments, or semantic proxies. An
unresolved case must retain every otherwise valid form or fail closed; semantic
interpretation must never decide it.

## Deferred

- broader runtime expansion beyond the current reviewed catalog;
- resolution of ambiguous or unmatched identities surfaced by a current generation;
- human pilot validation and evidence-based threshold changes;
- sentence-variety refinement after the reviewed lexicon grows;
- recall curriculum;
- alternate layouts;
- accounts, cloud sync, or telemetry;
- claims about real learning effectiveness.

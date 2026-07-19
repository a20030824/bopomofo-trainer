# Architecture

## Style

Use a lightweight modular monolith:

- one repository;
- one TypeScript project;
- no backend in the initial product;
- no package-per-module monorepo;
- framework-independent domain logic;
- infrastructure added behind small interfaces only when required.

## Modules

```text
src/
  core/          Shared domain types and invariants.
  scheme/        Bopomofo tokens, syllable rules, and layouts.
  catalog/       Source parsing, validation, compiled items, queries.
  curriculum/    Confidence, focus selection, and item sampling.
  session/       Progress through one item and observation creation.
  metrics/       Profile aggregation and performance estimates.
  infrastructure/ Optional persistence, clock, and random adapters.
  app/           Future thin web interface.
```

A module is a source directory, not a separately published package.

## Dependency direction

```text
app ───────────────┐
infrastructure ────┼──> session / curriculum / metrics
catalog compiler ──┘                 │
                                     v
                               core + scheme
```

Rules:

1. `core` imports nothing from the application.
2. `scheme` may depend on core types but not UI or storage.
3. `catalog` produces semantic `TrainingItem` values; it does not produce physical key sequences.
4. `curriculum` consumes a catalog and learner profile; it does not know about DOM events.
5. `session` converts already-normalized token input into observations.
6. `metrics` consumes observations; it does not choose UI presentation.
7. `app` coordinates modules but contains no learning algorithm.

## Data flow

```text
human-maintained word source
        ↓
validation and compilation
        ↓
semantic training catalog
        ↓
curriculum selects focus and item
        ↓
input layout maps physical code to token
        ↓
session engine checks expected token
        ↓
neutral observations
        ↓
metrics update learner profile
        ↓
next curriculum decision
```

## Extension seams

Only four seams are intentionally preserved at the start.

### Scheme and layout

Supports a different physical Bopomofo layout without changing the catalog. A future input scheme may introduce a different token set and compiler.

### Catalog compiler

Allows changing word sources, frequency metadata, and review workflow while keeping runtime items stable.

### Curriculum strategy

Allows experiments such as token-only, transition-aware, beginner progression, or tone-focused lessons.

### Progress store

The core will depend on a minimal persistence contract. Initial simulations use memory. A browser prototype may begin with local storage and move to IndexedDB only if raw observations or large histories are retained.

## First executable artifact

The first runnable feature should be a curriculum simulator, not a typing UI. It should accept:

- a compiled sample catalog;
- a synthetic learner profile;
- a deterministic random seed;
- a requested number of selections.

It should report focus distribution, token coverage, frequency-band balance, and recent repetition.

## Deferred decisions

- React, Preact, Svelte, or vanilla DOM.
- IndexedDB and raw-event retention.
- Exact smoothing filter for time-to-type.
- Transition-aware scoring.
- Account or cloud architecture.

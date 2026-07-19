# Architecture

## Style

Use a lightweight modular monolith:

- one repository;
- one TypeScript project;
- no backend in the initial product;
- no package-per-module monorepo;
- framework-independent domain logic;
- infrastructure added behind small interfaces only when required.

The first architecture is Bopomofo-specific. It preserves alternate physical Bopomofo layouts but does not pre-build a generic plugin platform for unrelated input methods.

## Modules

```text
src/
  core/          Shared domain types, identities, and invariants.
  scheme/        Bopomofo tokens, syllable rules, and physical layouts.
  catalog/       Source parsing, provenance, validation, and compiled entries.
  practice/      Practice modes, exercises, sessions, and observations.
  measurement/   Layout-scoped binding, transition, and confusion statistics.
  curriculum/    Coverage phase, focus eligibility, and exercise sampling.
  infrastructure/ Optional persistence, clock, and random adapters.
  app/           Future thin interaction spike and product interface.
```

A module is a source directory, not a separately published package. The current skeleton may be migrated incrementally toward these names; directory naming is less important than the dependency boundaries.

## Dependency direction

```text
app ─────────────────────┐
infrastructure ───────────┼──> practice / curriculum / measurement
catalog compiler ─────────┘                 │
                                             v
                                       core + scheme
```

Rules:

1. `core` imports nothing from the application.
2. `scheme` may depend on core types but not UI or storage.
3. `catalog` produces semantic `CatalogEntry` values; it never produces physical key sequences.
4. `practice` turns selected entries into an `Exercise` and normalized token attempts into observations.
5. `measurement` consumes observations and scopes motor skill by practice mode and layout.
6. `curriculum` consumes a catalog and learner profile; it does not know about DOM events.
7. `app` coordinates modules but contains no learning algorithm.
8. Recall-mode and guided-mode measurements remain separate.

## Data flow

```text
traceable vocabulary and reading sources
                ↓
        validation and compilation
                ↓
          semantic catalog entries
                ↓
 curriculum builds a multi-entry exercise
                ↓
 practice mode decides visible guidance
                ↓
 layout maps physical code to semantic token
                ↓
 session checks expected token and preserves boundaries
                ↓
 context-rich observations
                ↓
 layout-scoped measurement updates learner profile
                ↓
 next coverage or adaptive curriculum decision
```

## Extension seams

Only four seams are intentionally preserved at the start.

### Bopomofo layout

Supports a different physical Bopomofo layout without changing catalog readings. Skill measurements remain separate per layout.

### Catalog compiler

Allows changing word sources, pronunciation metadata, frequency bands, and review workflow while keeping runtime entries stable.

### Curriculum strategy

Allows experiments such as baseline coverage, focused-token selection, transition-aware selection, beginner progression, or tone-focused lessons.

### Progress store

The core depends on a minimal persistence contract. Initial interaction traces may remain in memory or be downloaded manually. Browser persistence is added only after the measurement policy is stable.

## First executable artifact: interaction spike

The first runnable feature is a deliberately disposable human-operated measurement page, not a polished product UI and not the final curriculum simulator.

It should:

- show Chinese context and complete visible Bopomofo readings;
- accept Taiwan Standard Bopomofo physical keys in English keyboard mode;
- preserve entry and syllable boundaries while allowing several entries per exercise;
- record raw key code, timestamp, expected token, actual token, correctness, and timing context;
- export or display an event trace for inspection;
- avoid permanent progress scoring until timing semantics are reviewed.

The spike answers interaction questions that a headless simulation cannot answer: whether the guidance is readable, whether first-tone Space feels coherent, where cognitive resets occur, and how errors affect timing.

## Second executable artifact: curriculum simulator

After the interaction spike defines credible measurement rules, build a deterministic simulator that accepts:

- a compiled sample catalog;
- a synthetic layout-scoped learner profile;
- coverage and focus eligibility rules;
- a deterministic random seed;
- a requested number of exercises.

It reports focus distribution, token coverage, frequency-band balance, exercise diversity, and recent repetition.

## Deferred decisions

- React, Preact, Svelte, or vanilla DOM for the product UI.
- IndexedDB and raw-event retention.
- Exact smoothing filter for time-to-type.
- Final timing-context inclusion policy.
- Error recovery timing semantics.
- Transition-aware scoring.
- Recall-mode curriculum.
- Account or cloud architecture.
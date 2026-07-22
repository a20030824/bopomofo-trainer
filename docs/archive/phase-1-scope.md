# Phase 1 scope boundaries

This phase establishes source parsing and catalog feasibility only.

Included:

- explicit-tone Bopomofo reading parsing;
- legal Mandarin syllable-body validation;
- source-row and provenance validation;
- semantic catalog compilation;
- token and tone coverage reporting;
- provisional sample data;
- deterministic tests and CI.

Deferred:

- browser keyboard events;
- guided exercise presentation;
- timing and error observations;
- learner profiles and persistence;
- confidence or smoothing formulas;
- adaptive curriculum selection;
- production vocabulary imports.

The next phase must consume semantic `CatalogEntry` output instead of re-parsing CSV inside the browser page.

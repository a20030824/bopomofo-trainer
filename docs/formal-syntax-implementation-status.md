# Formal syntax implementation status

## Branch scope

This status applies to `agent/formal-syntax-system` and Draft PR #84.

The branch implements the formal syntax foundation and keeps the existing 11-template composer as the production compatibility path. The template path is intentionally not removed in this branch state because the formal removal gate is still blocked.

## Completed foundation

The branch currently provides:

- the versioned `mandarin-formal-grammar-v1` contract;
- complete representation of all 17 UD UPOS values;
- committed syntax-only UD evidence v2 artifacts replayed from pinned r2.18 sources;
- per-UPOS evidence partitioning without `dominantUpos` reduction;
- multiple `SyntaxProfile` records per exact `(text, reading)` entry;
- written-form evidence sharing across all active readings without semantic disambiguation;
- formal grammar IR, finite-cardinality validation, forbidden-field validation, and recursion-cycle validation;
- phrase, clause, question, complement, embedded-clause, and recursive complex-clause production inventories;
- lazy exhaustive structural enumeration within versioned bounds;
- bounded random structural sampling for product use;
- lazy lexical realization without materializing the complete lexical Cartesian product;
- a frequency-stage-compatible formal composer that accepts only already eligible entries;
- machine-readable syntax coverage and a fixed-template removal gate.

The complete grammar inventory currently contains 83 production rules and 192 positive/negative fixtures.

The committed v2 replay preserves the locked aggregate results:

```text
observed candidates  942
unseen candidates     58
matching occurrences  52,938
review candidates     403
```

## Fixed-template removal gate

`evaluateFixedTemplateRemovalGate()` permits removal only when all of the following are true:

1. the active committed syntax evidence artifact is `ud-syntax-evidence-v2`;
2. all 17 UPOS values have at least one formal lexical position;
3. every admitted syntax profile is realizable;
4. every production rule has valid positive and negative fixtures;
5. exhaustive structural shape counting is complete for the accepted derivation bounds;
6. the new path passes legacy candidate parity;
7. browser session migration passes;
8. progress migration passes;
9. held-out isolation passes;
10. the formal runtime path is enabled as the product default.

The old composer must not be removed when any condition is false.

## Current blockers

The following blockers remain on this branch.

### Full-catalog profile and reachability report

The coverage generator is implemented and the v2 top-1,000 evidence artifacts are committed. The final current-catalog report still requires:

- projection against the current 322 exact `(text, reading)` entries;
- complete bounded structural shape counts for the accepted grammar bounds;
- confirmation that `unrealizableProfileCount` is zero for the admitted product index.

Entries without evidence must remain listed under `noUdEvidenceEntryIds`; they must not receive guessed profiles.

### Product parity and migration

The formal composer is available as an explicit compatibility module, but it is not the default runtime path. The following product gates are not yet claimed as passing:

- output parity against the current 11-template candidate baseline;
- browser session migration;
- progress migration;
- held-out isolation;
- default-runtime cutover.

## Required next sequence

The safe continuation is:

1. project the current 322-entry catalog from the committed v2 evidence artifact;
2. emit the full machine-readable current-catalog coverage report;
3. count structural derivation shapes for the accepted bounds;
4. complete legacy parity and product migration tests;
5. enable the formal path as the default only after those tests pass;
6. remove the fixed-template production path in a separate commit only when the gate returns `removalAllowed: true`.

Until then, retaining the old composer is required by the migration contract, not an incomplete deletion.

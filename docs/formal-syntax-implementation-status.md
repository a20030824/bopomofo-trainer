# Formal syntax implementation status

## Branch scope

This status applies to `agent/formal-syntax-system` and Draft PR #84.

The branch implements the formal syntax foundation and keeps the existing 11-template composer as the production compatibility path. The template path is intentionally not removed in this branch state because the formal removal gate is still blocked.

## Completed foundation

The branch currently provides:

- the versioned `mandarin-formal-grammar-v1` contract;
- complete representation of all 17 UD UPOS values;
- syntax-only UD evidence v2 projection code;
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

The following blockers remain on this branch:

### Committed UD artifact replay

The adapter and fixture tests implement `ud-syntax-evidence-v2`, but the large committed top-1,000 JSON artifacts have not been replayed from the pinned ignored CoNLL-U files in this execution environment.

The required local source files are:

```text
data/external/ud/chinese-gsd/r2.18/zh_gsd-ud-train.conllu
data/external/ud/chinese-gsd/r2.18/zh_gsd-ud-dev.conllu
data/external/ud/chinese-gsd/r2.18/zh_gsd-ud-test.conllu
```

They must match the checksums documented in `docs/reference-sources/ud-chinese-gsd-naer-top-1000-grammar-evidence.md`. Once present, replay with:

```bash
npm run grammar:ud-evidence
```

The replay must preserve the locked candidate and occurrence counts before accepting the new v2 determinism digests.

### Full-catalog profile and reachability report

The coverage generator is implemented, but the final committed report still requires:

- the current 322-entry catalog;
- profiles projected from the regenerated v2 evidence artifact;
- complete bounded structural shape counts;
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

1. replay and commit the pinned v2 UD artifacts;
2. project profiles for the current catalog;
3. emit the full machine-readable coverage report;
4. count structural derivation shapes for the accepted bounds;
5. complete legacy parity and product migration tests;
6. enable the formal path as the default only after those tests pass;
7. remove the fixed-template production path in a separate commit only when the gate returns `removalAllowed: true`.

Until then, retaining the old composer is required by the migration contract, not an incomplete deletion.

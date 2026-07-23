# Formal syntax implementation status

## Branch scope

This status applies to `agent/formal-syntax-system` and Draft PR #84.

The branch implements the formal syntax foundation while keeping the existing 11-template composer as the production compatibility path. Foundation merge and fixed-template removal are separate decisions: this PR may enter `main` with the removal gate still blocked, provided the legacy runtime remains unchanged and all foundation checks pass.

## Completed foundation

The branch provides:

- the versioned `mandarin-formal-grammar-v1` contract;
- representation of all 17 UD UPOS values;
- committed syntax-only UD evidence v2 replayed from pinned r2.18 sources;
- per-UPOS evidence partitioning without `dominantUpos` reduction;
- multiple `SyntaxProfile` records per exact `(text, reading)` entry;
- written-form evidence sharing across all active readings without semantic disambiguation;
- formal grammar IR, finite-cardinality validation, forbidden-field validation, recursion-cycle validation, and fail-closed rejection of reserved non-empty rule-level constraints;
- phrase, clause, question, complement, embedded-clause, and recursive complex-clause production inventories;
- lazy exhaustive structural enumeration within versioned bounds;
- bounded random structural sampling for product use;
- lazy lexical realization without materializing the complete lexical Cartesian product;
- a frequency-stage-compatible formal composer that accepts only already eligible entries;
- machine-readable syntax coverage and a fixed-template removal gate.

The grammar inventory contains 83 production rules, 109 positive fixtures, and 83 negative fixtures.

For `mandarin-formal-grammar-v1`, executable requirements are represented by constituent cardinality, `requiredFeatures`, `requiredFunctions`, and `requiredValencyFrames`. The rule-level `constraints` array is reserved for a later grammar version and must remain empty. Validation rejects every non-empty array so enumeration, random sampling, and structural counting cannot silently ignore a declared constraint.

The committed v2 evidence replay preserves:

```text
observed candidates   942
unseen candidates      58
matching occurrences   52,938
review candidates      403
```

## Current catalog coverage

The committed current-catalog artifacts report:

```text
catalog entries                         322
entries with at least one profile       305
entries without UD evidence              17
syntax profiles                          390
written forms with multiple readings      13
reading-variant entries                   30
fully profiled multi-reading forms        13
missing UPOS lexical positions             0
unrealizable profiles                      1
bounded structural shape count 393809961105380
```

The sole unrealizable profile is the minority `NUM` profile of `不少`. Its observed product function is `object`, while the current numeral lexical positions require `numeral`. The same entry remains usable through its realizable `ADJ` profile. This is a fixed-template-removal blocker, not evidence that the complete entry or foundation is invalid.

The 17 entries without UD evidence remain explicitly listed in the coverage artifact. They receive no guessed profile.

## Artifact verification

`npm run grammar:formal-syntax-coverage` deterministically regenerates the committed profile and coverage artifacts.

`npm run grammar:formal-syntax-verify` rebuilds both artifacts in memory and compares them byte-for-byte with the committed files. It is part of the ordinary PR check. The former workflow that granted `contents: write` and pushed generated commits back to the PR branch has been removed.

## Final re-review

The narrow final re-review checked artifact versioning, workflow permissions, fail-closed validation, candidate identity, entry weighting, profile multiplicity, punctuation handling, and temporary-file residue.

One blocker was found and corrected: the IR exposed rule-level `constraints`, while exhaustive derivation, random sampling, and structural counting did not execute them. The validator now rejects all non-empty constraints for grammar v1, with a regression test proving the boundary. No current production rule uses this reserved field, so the committed coverage and shape counts are unchanged.

## Fixed-template removal gate

`evaluateFixedTemplateRemovalGate()` permits removal only when all of the following are true:

1. the active syntax evidence artifact is `ud-syntax-evidence-v2`;
2. all 17 UPOS values have at least one formal lexical position;
3. every profile admitted to the product derivation index is realizable;
4. every production rule has valid positive and negative fixtures;
5. exhaustive structural shape counting is complete for the accepted bounds;
6. the formal path passes legacy candidate parity;
7. browser session cutover passes;
8. a new progress generation is activated for the formal-runtime cutover;
9. held-out isolation passes;
10. the formal runtime path is enabled as the product default.

The old composer must not be removed when any condition is false.

## Progress boundary after PR #86

`main` no longer migrates historical progress payloads. Product progress is generation-scoped, obsolete storage keys are deleted, and incompatible payloads start fresh.

The formal-runtime cutover must follow the same policy: rotate or explicitly validate the current progress generation so legacy template, utterance, and session identities cannot survive into the formal runtime. The removal gate therefore requires `progressGenerationResetPassed`; it does not require or permit legacy progress migration.

## Remaining runtime blockers

The foundation is implemented, but the production cutover is not claimed complete. Remaining blockers are:

- resolve or explicitly exclude the single unrealizable `不少`/`NUM` profile from the admitted product index without weakening all numeral function gates;
- prove output parity against the current 11-template candidate baseline where parity is contractually required;
- complete browser session cutover tests;
- complete the formal-runtime progress generation reset;
- prove held-out evaluation isolation under the formal composer;
- enable the formal composer as the default runtime;
- remove the fixed-template composer only in a later change after `removalAllowed: true`.

## Safe continuation

1. merge this foundation only after ordinary repository CI and deterministic artifact verification pass;
2. keep the 11-template runtime unchanged in that merge;
3. inspect the original UD occurrence behind `不少`/`NUM` before changing grammar reachability;
4. implement runtime parity, session cutover, progress generation reset, and held-out isolation in a separate PR;
5. enable the formal runtime only after those gates pass;
6. remove the old composer in a final separate PR only when the removal gate allows it.

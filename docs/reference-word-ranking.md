# Reference word ranking

## Separation of concerns

Word sourcing is not exercise construction.

The repository keeps three text universes separate:

1. grammar-supported relations;
2. external Taiwan Mandarin reference words and frequency evidence;
3. the smaller reviewed catalog eligible for simulation and practice composition.

A reference word may rank highly for review without being automatically approved or selected in a practice sequence.

## Source boundary

Registered source metadata lives in `data/reference-sources.json`. Raw downloads and batch-normalized outputs remain in ignored local directories until redistribution terms are confirmed.

The first source roles are:

- NAER graded words and general frequency for candidate text, Bopomofo, level, domain, and oral/written frequency;
- MOE Concise Mandarin Dictionary for modern Taiwan Mandarin pronunciation cross-checking.

Official-source adapters must produce one resolved Han headword and one explicit digit-tone reading per row. Slash alternatives, unresolved readings, invalid syllables, negative frequency, and text/reading mismatches are rejected instead of guessed.

## Relation contribution

A valid candidate is traversed as an ordered semantic path. Its contribution includes:

- binding and exact directional transition keys;
- occurrence counts;
- entry-initial binding roles;
- held-out partition repairs;
- rare-only and concentrated support repairs;
- distinct-entry deficit reduction;
- newly reference-observed grammar-supported relations.

One candidate can add only one distinct supporting entry to a relation even if that relation appears multiple times in the word.

## Inspectable ranking

The first review queue does not use one weighted total. Each candidate retains a lexicographic priority vector derived from named components:

```text
partition repair
rare-only repair
binding support-deficit reduction
transition support-deficit reduction
new reference-observed relations
oral frequency
written frequency
proficiency level
sequence length
stable candidate ID
```

Named profiles change component order:

- `partition-repair`;
- `binding-broadening`;
- `transition-broadening`;
- `balanced-review`.

The same candidate contribution is reused across profiles, so changing review priorities cannot silently change relation analysis.

## Deterministic exclusions

The queue separately records:

- text and reading already present in the reviewed catalog;
- policy-excluded candidate IDs;
- duplicate candidate IDs;
- duplicate reference text/reading identities.

Cross-source corroboration will later merge source evidence before ranking rather than allowing duplicate rows to appear as independent word candidates.

## Current fixture behavior

The test fixture demonstrates the intended semantics:

- `可樂` repairs both `ㄎ→ㄜ` and `ㄜ→三聲`, so it leads the partition-repair queue;
- `永遠` repairs `ㄩ→ㄥ`;
- `吃飯` leads binding broadening because `ㄔ` is rare-only in the current reviewed training data;
- an externally repeated `中文` row is excluded because the same semantic entry is already reviewed.

These examples validate ranking behavior only. They are not automatically approved additions to the catalog.

## Next adapter

The next source-specific PR will read user-supplied official files from `data/external/`, preserve source row IDs, normalize resolved records, and generate a local review queue. Full external data will not be committed by default.

# Catalog reading resolution

The runtime catalog no longer treats the `reading` column in
`data/source/words.sample.csv` as authoritative. That column remains a useful
provisional fallback and review diff, but every active entry is resolved from
committed source evidence before catalog compilation.

## Authority order

The resolver applies exactly one source to every active catalog *row*. A text
has more than one active row when it is a real heteronym (more than one valid
reading for the same hanzi, e.g. `了`, `個`, `要`); each reading variant is
its own row and is resolved independently, so a heteronym's variants can come
from different authorities.

1. `moe-concised` — unique exact-headword reading from the Ministry of
   Education 《國語辭典簡編本》;
2. `moe-revised` — unique exact-headword provisional fallback from
   《重編國語辭典修訂本》;
3. `cedict` — one exact candidate record from the manually pinned CC-CEDICT
   projection, converted from numbered pinyin to trainer Bopomofo;
4. `manual` — an explicit reviewed choice for identities that remain ambiguous
   or unmatched after all external sources.

Lower-authority evidence cannot replace a reading already accepted at a higher
level. Overlap is a build error rather than a tie to be broken.

## Current distribution

The active catalog's per-source row counts grow with every activation batch;
check `npm run app:catalog`'s own printed summary
(`resolved readings {...}`) for the current split rather than a number
recorded here.

One illustrative correction the resolver makes: the CSV's own provisional
reading for `我們` was `ㄨㄛ3 ㄇㄣ2`; MOE Concised evidence corrects the
second syllable's tone to neutral (`ㄨㄛ3 ㄇㄣ5`).

The manual reading for `東西` selects the common noun meaning “thing; stuff”
and therefore uses the neutral-tone second syllable — this is a genuine
heteronym where a human explicitly chose one sense over including both
readings (see `docs/reference-sources/cedict-local-identity-hints.md` for the
newer default of including every reading instead).

## Inputs

The resolver consumes only committed local files:

```text
data/source/words.sample.csv
data/readings/moe-concised-2014_20260626-active-catalog.json
data/readings/moe-revised-2015_20260625-active-catalog-fallback.json
data/identity/cedict-active-catalog-hints.json
data/readings/manual-reading-overrides.json
```

There are no runtime dictionary requests and no CI download of external lexical
sources.

## Outputs

`npm run catalog:build` writes:

```text
data/generated/catalog.json
data/generated/coverage.json
data/generated/reading-resolution.json
```

The full reading report includes the previous and resolved reading, selected
source, source version, evidence identity, confidence, reasons, changed texts,
source counts, and a SHA-256 determinism digest.

`npm run app:catalog` embeds these constants into the generated application
catalog module:

```text
READING_RESOLUTION_DIGEST
READING_RESOLUTION_COUNTS
READING_RESOLUTION_CHANGED_TEXTS
```

The application still receives ordinary `CatalogEntry` objects; reading audit
metadata stays a build-time concern rather than expanding the runtime model.

## Provenance

The resolver preserves the original sample provenance because the CSV still
supplies the text, tags, frequency band, and provisional review context. It adds
the selected reading-source provenance ID:

```text
moe:concised-dictionary
moe:revised-dictionary
cc-cedict:manual-release
local:reading-review-v1
```

Grammar annotations retain their own grammar provenance. Their `reading` field
is synchronized only so that the annotation identity follows the resolved
catalog entry ID.

## Fail-closed conditions

Compilation fails when any of these occur:

- duplicate active catalog (text, reading) row — a text may legitimately
  repeat across rows as a heteronym, but never with the same reading twice;
- projection adapter-version mismatch;
- candidate-count mismatch;
- source evidence outside the active catalog;
- overlap between authority levels;
- Revised evidence outside its recorded fallback basis;
- CEDICT targets that no longer equal the MOE-unresolved set;
- duplicate or malformed CEDICT rows;
- a single-reading authority (MOE, CEDICT-unique) resolving a text that has
  more than one active row — that shape is only valid for the heteronym path,
  which activates every CEDICT-ambiguous reading explicitly rather than
  picking one (see `docs/reference-sources/cedict-local-identity-hints.md`);
- unsupported or unnumbered pinyin;
- stale, missing, duplicate, or extra manual overrides;
- incomplete resolution;
- grammar sidecar text without a resolved catalog identity.

These checks intentionally make source updates noisy. A new dictionary release
must produce an explicit review diff instead of silently changing practice
content.

## Non-reading contracts

Reading resolution does not change:

- NAER commonness;
- frequency-band stage eligibility;
- grammar roles, predicate frames, or templates;
- learner weakness and speed boosts;
- confusion diagnostics;
- transition scoring;
- deterministic product partitioning.

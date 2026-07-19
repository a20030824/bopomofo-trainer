# Data Sources

The current `words.sample.csv` contains 50 hand-authored entries for parser, coverage, and interaction experiments. It is not a production vocabulary dataset, an authoritative pronunciation source, or validated frequency data.

All current rows are marked `provisional` and reference `local:sample-v1` from `data/provenance.csv`. That status means they are suitable for engineering experiments only. It does not mean the reading, frequency band, or vocabulary choice has completed a documented review workflow.

Before importing a larger source, record:

- source name and version;
- download date;
- license and attribution requirements;
- fields used by this project;
- whether readings are word-level or assembled per character;
- whether entries were modified or only linked to derived metadata;
- review status for ambiguous or multiple readings.

## Registered references

- `local:sample-v1`: manually authored provisional words used only by this repository's tests and spike.
- `moe:phonetic-symbols-manual`: Ministry of Education *國語注音符號手冊*, used as the reference for the syllable-table validation approach. The project implements an independent program representation and does not redistribute the manual's tables.

See `docs/syllable-validation.md` for the parser boundary and known limitations.

## Planned source layers

The production catalog will likely combine three independently traceable layers:

1. a candidate word list;
2. Taiwan-oriented word-level readings;
3. coarse frequency bands or rankings.

These layers should remain separable in source data so that licensing, correction, and replacement do not require rewriting the runtime model.

## Entry status

- `provisional`: hand-authored or imported for architecture and interaction experiments; not approved for a production catalog.
- `reviewed`: pronunciation and vocabulary suitability were checked under a documented process and linked to provenance.
- `excluded`: retained only when needed to document a rejected ambiguous, invalid, or unsuitable entry.

## Review policy

- Every syllable must include an explicit tone number from 1 to 5.
- Word-level readings take precedence over choosing the first reading of each character.
- Ambiguous entries remain excluded until reviewed.
- Frequency band 3 means a legal coverage word, not an invitation to include obscure vocabulary.
- A runtime `CatalogEntry` references provenance IDs rather than embedding untraceable copied metadata.

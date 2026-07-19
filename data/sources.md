# Data Sources

The current `words.sample.csv` is a small hand-authored architecture sample. It is not a production vocabulary dataset and should not be treated as authoritative frequency data.

Before importing a larger source, record:

- source name and version;
- download date;
- license and attribution requirements;
- fields used by this project;
- whether readings are word-level or assembled per character;
- whether entries were modified or only linked to derived metadata;
- review status for ambiguous or multiple readings.

## Planned source layers

The production catalog will likely combine three independently traceable layers:

1. a candidate word list;
2. Taiwan-oriented word-level readings;
3. coarse frequency bands or rankings.

These layers should remain separable in source data so that licensing, correction, and replacement do not require rewriting the runtime model.

## Review policy

- Every syllable must include an explicit tone number from 1 to 5.
- Word-level readings take precedence over choosing the first reading of each character.
- Ambiguous entries remain excluded until reviewed.
- Frequency band 3 means a legal coverage word, not an invitation to include obscure vocabulary.

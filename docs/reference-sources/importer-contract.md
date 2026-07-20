# Reference source importer contract

## Scope

This importer converts a user-supplied local Taiwan Mandarin source file into three deterministic artifacts:

1. normalized `ReferenceSourceRow` values;
2. compiled `ReferenceCandidate` values that remain outside the reviewed catalog;
3. a structured row-level error queue.

It does not rank candidates, approve catalog entries, compose practice content, partition data, or download source files.

## Data boundary

Official XLSX, ODS, ZIP, JSON, and derived bulk outputs stay under ignored local directories:

- `data/external/`
- `data/reference-generated/`

Committed fixtures under `data/fixtures/reference/` are hand-authored and use `example.invalid`; they do not copy official rows. A source manifest's redistribution status controls whether any future derived bulk data may be committed.

## Adapter boundary

`ReferenceSourceAdapter` is the source-specific seam. A tabular instance declares:

- adapter ID and version;
- source ID and source version;
- CSV or JSON input format;
- exact source column names;
- tone notation policy;
- domain separator;
- optional per-record URL template.

Column changes require a new declared adapter/source version. The importer never guesses a replacement column or synthesizes a missing source row ID.

The initial adapter intentionally accepts normalized CSV/JSON text. XLSX/ODS extraction remains a thin future file-decoding layer that must feed the same tabular contract after real source columns are pinned.

## Reading normalization

The normalized shared `ReferenceSourceRow.reading` always uses one space-separated Bopomofo syllable per Han character and an explicit trailing tone digit `1`–`5`.

The raw source reading is retained separately in each accepted import record and error entry.

Tone policy is declared per adapter:

- `diacritic`: `ˉ`, `ˊ`, `ˇ`, `ˋ`, and `˙` become tones 1–5; an unmarked syllable becomes tone 1.
- `explicit-digits`: every syllable must already end in `1`–`5`.
- `mixed`: explicit digits and tone marks are accepted, but an unmarked syllable is queued as `missing_tone` rather than guessed as first tone.

A unique tone mark is removed and represented by the explicit digit. Mixed digit/mark encodings, multiple tone marks, unsupported syllables, slash alternatives, branch separators, and pronunciation arrays with more than one value are queued. The importer does not segment an unspaced multi-syllable reading or choose one heteronym.

## Frequency semantics

A blank or null frequency becomes `null`. Numeric zero remains `0`. Negative, non-finite, boolean, array, and non-numeric values are rejected as `invalid_frequency`.

This distinction is preserved in the accepted row and in machine-readable normalization reasons.

## Duplicate identity

Source row identity is `NFC(trim(sourceRowId))` within one source import. If an identity appears more than once, every occurrence is rejected with `duplicate_source_row_identity`.

Rejecting all occurrences avoids a hidden first-row-wins policy and makes conflicting source updates visible. `duplicateCount` is the number of rejected source rows carrying duplicated identities.

## Error queue

Required primary reason codes are:

- `unresolved_alternatives`
- `multiple_pronunciations`
- `missing_tone`
- `text_reading_syllable_mismatch`
- `invalid_frequency`
- `non_han_text`
- `unsupported_syllable`
- `duplicate_source_row_identity`

Additional adapter/contract reasons cover malformed tabular rows, missing required columns, invalid source identity or URL, unknown source, and invalid level metadata.

Each mapped error preserves the full adapter row together with source ID/version, adapter ID/version, zero-based source input index, source row ID, raw reading, partial normalized reading when available, pipeline stage, primary code, and machine-readable reason details. A parser-level malformed row has `adapterRow: null` because no safe field mapping exists. A malformed row does not stop later rows from being imported.

## Ordering, fallback, and stopping

Accepted records and errors preserve source input order. No ranking or fallback is performed. The summary records:

- `orderingReason: source_input_order`
- `fallbackReason: no_fallback`
- `stopReason: end_of_input`

These are machine-readable declarations, not prose-only behavior.

## Determinism

The serializer recursively sorts object keys while preserving array order. The SHA-256 determinism digest covers:

- source manifest;
- accepted audit records, normalized rows, and candidates;
- error queue;
- summary fields other than the digest itself.

The same input bytes, source/adapter versions, configuration, and shared compiler produce byte-for-byte identical output. A source or adapter version change intentionally changes the digest.

## Traceability and review boundary

`ReferenceCandidate` retains source ID and source row ID. The accepted importer envelope maps that candidate back to input index, raw reading, normalized reading, adapter version, and `ReferenceSourceRow`. This provides bidirectional traceability without adding a parallel candidate type.

Import output is only a reference-candidate queue. No candidate is automatically inserted into the reviewed catalog.

## CLI

Run the generic local adapter without changing `package.json`:

```text
npx tsx scripts/import-reference-tabular.ts \
  data/external/source-adapter.json \
  data/external/source.csv \
  data/reference-generated/source-import.json
```

The config is local because real official column names and redistribution constraints may change. The output includes accepted records, error queue, summary, and determinism digest.

## Research decisions in this phase

- Multiple pronunciations remain in the manual error queue; they are not split because doing so would silently turn one official record into several review identities without a source-specific rule.
- Attached erhua and other forms outside the shared standalone-syllable grammar are queued as `unsupported_syllable`. Standalone `ㄦ` remains valid when the shared grammar accepts it.
- Slash variants and heteronym branches remain unresolved source evidence. Variant-character policy is deferred to reviewed-catalog work.
- A source row ID is treated as stable only when supplied by the source adapter. The importer never derives identity from row number or text. Source-version regression tests keep candidate identity stable when a declared schema changes but the source ID remains stable.
- Identical `text + reading` from different sources remain separate source candidates so provenance is not lost. Cross-source corroboration and duplicate-review suppression belong downstream and must merge evidence rather than delete source identities.
- Missing frequency is `null`, while an observed zero remains `0`; neither is used to infer the other.

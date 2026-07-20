# Reference importer reverse review

## Data contamination

- Committed fixtures are hand-authored and use fictional URLs.
- No official XLSX, JSON, dictionary entry, definition, example sentence, image, or audio is committed.
- The CLI reads local files only and never downloads a source.

## Hidden assumptions

- First-tone inference is allowed only when the adapter explicitly declares `diacritic` notation.
- Unspaced multi-syllable readings are not segmented.
- Multiple pronunciations and slash/branch variants are never collapsed.
- Missing per-record URLs remain explicit `null` unless the adapter declares a URL template. Non-string URL values are rejected rather than silently treated as missing.

## Duplicate counting

- Duplicate detection runs before semantic compilation.
- Every occurrence of a duplicated source row ID is rejected; no arbitrary first winner survives.
- Summary duplicate count is row-based and matches duplicate error entries.

## Boundary behavior

- CSV headers are not source rows.
- Source input indexes are zero-based data-row indexes.
- Accepted rows and errors preserve source order.
- Blank frequency and numeric zero are distinct.
- Text/reading alignment counts Unicode Han code points against normalized syllables.
- Mapped rejected rows retain their complete adapter row; parser-level rows explicitly retain `adapterRow: null`.

## Replayability

- Output uses canonical key ordering and stable input-order arrays.
- Digest excludes only its own field.
- Adapter and source versions participate in the digest.
- No clock, random source, locale collation, network result, or filesystem enumeration enters the result.

## Premature abstraction

- Only CSV/JSON text decoding is implemented.
- No spreadsheet dependency, download client, source-specific ranking, cross-source deduplication, or catalog approval abstraction is introduced.
- Real XLSX adapters should pin observed columns and feed this contract rather than broaden it speculatively.

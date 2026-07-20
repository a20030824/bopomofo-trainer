# Unterminated CSV tail regression

A CSV file may contain valid completed records before its final quoted field is left open at end of file. The importer preserves every completed logical record and represents only the unfinished tail as one `malformed_tabular_row`.

The tail error retains its zero-based logical input index, any recoverable configured source row identity, and deterministic details:

- `parseFailure: unterminated_quoted_field`
- quoted field index
- expected field count
- recovered tail field count

This is a row-level failure rather than a batch-level exception. A malformed header remains a schema-level failure because no safe row mapping exists without a complete header.

# Catalog source format

The Phase 1 source file is CSV with these columns:

| Column | Meaning |
| --- | --- |
| `text` | Pure Han-character prompt for the initial catalog. |
| `reading` | Space-separated Bopomofo syllables, each ending in numeric tone `1`–`5`. |
| `frequency_band` | Coarse priority `1`, `2`, or `3`; not a measured corpus frequency. |
| `tags` | Semicolon-separated descriptive tags. |
| `status` | `provisional`, `reviewed`, or `excluded`. |
| `provenance_ids` | Semicolon-separated IDs registered in `data/provenance.csv`. |

Example:

```csv
text,reading,frequency_band,tags,status,provenance_ids
中文,ㄓㄨㄥ1 ㄨㄣ2,1,general,provisional,local:sample-v1
```

The compiler rejects missing fields, unsupported statuses or bands, non-Han prompts, malformed or illegal syllables, character/syllable count mismatch, missing provenance, and duplicate text-reading pairs.

`excluded` rows remain available for documenting rejected source decisions but do not produce runtime `CatalogEntry` values.

# CC-CEDICT local identity-hint source

Status: local-source adapter boundary defined on 2026-07-22 (Asia/Taipei).

This source is lower authority than both Ministry of Education reading sources.
It exists to help resolve lexical identity after the MOE Concised and Revised
projections have finished, not to replace a Taiwan Mandarin reading.

## Authority order

1. MOE Concised unique exact-headword reading;
2. MOE Revised unique exact-headword reading, marked provisional;
3. CC-CEDICT traditional/simplified aliases, structured variant references, and
   pinyin candidates for identities still unresolved by both MOE sources;
4. manual review for remaining ambiguity.

NAER remains the commonness source. Product grammar roles remain
repository-owned derived metadata.

## Acquisition boundary

The CC-CEDICT project recommends downloading its latest release through MDBG:

- https://cc-cedict.org/editor/editor.php?handler=Download
- https://www.mdbg.net/chinese/export/cedict/

MDBG pages state that automated or scripted access is prohibited. Therefore:

- download the release manually in a browser;
- retain the release timestamp or version shown by MDBG;
- compute and record the downloaded file's SHA-256;
- pass the local file, version, and checksum explicitly to the adapter;
- never add a CI step that downloads from MDBG.

The CC-CEDICT editor also offers current non-verified exports for editing and
review. Those files may be used manually for parser compatibility checks but are
not treated as a verified release for product artifacts.

## License

The current CC-CEDICT download page identifies the work as CC BY-SA 4.0. Any
committed derivative that contains CC-CEDICT content must retain attribution and
respect share-alike requirements.

This adapter intentionally emits only a small candidate-scoped evidence file. It
does not commit the complete dictionary or English definitions.

## Supported source formats

The adapter accepts either:

- a plain UTF-8 CC-CEDICT data file; or
- a ZIP containing exactly one `.u8`, `.txt`, or `.cedict` data member.

Both CC-CEDICT line formats are supported.

Version 1:

```text
Traditional Simplified [pin1 yin1] /definition/
```

Version 2:

```text
Traditional Simplified [[pin1yin1]] /definition/
```

Version 2 uses standard pinyin orthography, so syllables belonging to one word
may be joined. The parser preserves the source pinyin string and does not try to
normalize v1 into v2.

## Fields used

The parser retains:

- source line number;
- format version;
- traditional headword;
- simplified headword;
- numbered pinyin;
- structured `variant of` target references;
- presence of a structured `CL:` classifier field;
- capitalization-derived proper-name hints.

English definitions are read only to detect the two structured syntaxes
`variant of ...` and `CL:`. Raw definitions are never emitted.

CC-CEDICT explicitly describes its definitions as human-readable rather than a
formal machine-processing part-of-speech schema. Consequently, this adapter does
not infer grammar roles from strings such as `to use` or `adjective`.

## Identity behavior

The adapter first loads the committed MOE projections and forms this target set:

```text
all active catalog identities
- MOE Concised accepted identities
- MOE Revised accepted identities
```

Any overlap between Concised and Revised accepted identities is a hard error.
Duplicate catalog identities are also rejected.

For each remaining target, exact matching is performed against both CEDICT
headword fields:

- exact traditional match;
- exact simplified match;
- both, when the forms are identical.

A unique simplified-only match may expose a `canonicalTraditionalHint`. A
structured `variant of` record may expose its target. These are hints for a later
identity resolver, not automatic reading replacements.

Multiple records, including one headword with multiple pinyin readings, remain
`ambiguous-records`. For example, `東西` may have distinct readings and must not
be collapsed automatically.

## Current target set

The two committed MOE projections resolve 43 of the current 49 catalog entries.
The six remaining CEDICT targets are:

```text
台灣、很好、想要、東西、看到、聽到
```

This PR defines and tests the parser but does not commit a real CC-CEDICT-derived
projection, because no release file was downloaded manually and checksum-pinned
for this repository session.

## Local command

After downloading a release manually:

```powershell
$source = 'data/external/cedict/<release>/cedict_1_0_ts_utf-8_mdbg.zip'
$sha = (Get-FileHash -Algorithm SHA256 $source).Hash.ToLower()

npm run identity:cedict -- `
  --dictionary $source `
  --expected-sha256 $sha `
  --source-version '<MDBG release timestamp>' `
  --output data/identity/cedict-active-catalog-hints.json
```

The generated artifact is deterministic for the same source bytes, checksum,
source version, and committed MOE projections.

## Deferred

- manually pinning a verified MDBG release and committing its six-target result;
- pinyin-to-Bopomofo conversion for identities still unresolved by MOE;
- choosing among multiple pinyin records;
- applying alias hints to generated catalog entries;
- grammar-role inference.

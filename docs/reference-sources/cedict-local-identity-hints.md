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
`ambiguous-records` at this adapter layer -- it only classifies unique vs.
ambiguous and never guesses a single reading itself.

`scripts/activate_cedict_heteronym_readings_generation.py` activates every distinct
converted reading as its own `(text, reading)` practice identity when the text
has usable syntax-only grammar evidence. Existing catalog membership is checked
at that pair identity, never at text alone: an already active reading does not
suppress a missing sibling reading. Meaning and sense selection are forbidden,
so neither human review nor an automated stage may pick one pronunciation and
discard the others on semantic grounds.

## Current target set

The CEDICT target set (candidates left unresolved after both MOE projections)
grows with every activation batch. Check
`data/identity/cedict-active-catalog-hints.json`'s own
`resolutionBasis.cedictTargetTexts` for the current set rather than a number
recorded here. A real CC-CEDICT-derived projection is committed and
regenerated locally via the command below whenever the active catalog
changes.

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

- applying alias hints (`canonicalTraditionalHint`, `variantTargets`) to
  generated catalog entries;
- grammar-role inference from CEDICT glosses -- still deliberately forbidden;
  grammar roles come only from UD evidence, never from CC-CEDICT definitions.

Done, no longer deferred: a verified MDBG release is pinned and committed;
pinyin-to-Bopomofo conversion runs automatically
(`src/readings/pinyin-to-bopomofo.ts`); and CEDICT's `ambiguous-records`
candidates are activated with every distinct reading rather than requiring a
human to choose one (see "Identity behavior" above).

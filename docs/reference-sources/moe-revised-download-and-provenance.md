# MOE Revised Dictionary fallback source

Status: pinned source observation from 2026-07-22 (Asia/Taipei).

This document records the source boundary for using the Ministry of Education
《重編國語辭典修訂本》 only as a provisional reading fallback after the
《國語辭典簡編本》 adapter has failed to resolve a candidate uniquely.

The official bulk archive remains local and is not committed to this repository.

## Authority order

Reading evidence is resolved in this order:

1. MOE Concised unique exact-headword reading;
2. MOE Revised unique exact-headword reading, marked `provisional`;
3. later CC-CEDICT alias or final pinyin fallback, never overriding either MOE source;
4. manual review for remaining ambiguity.

NAER remains commonness-only. Product grammar roles remain repository-owned
derived metadata rather than dictionary facts.

## Why Revised is fallback-only

The MOE public authorization site describes the Revised Dictionary as a historical
language dictionary that records vocabulary from Middle Chinese through modern
usage and includes both modern and traditional readings. Its breadth is useful for
coverage, but it does not justify automatically choosing a historical or traditional
reading for a modern typing trainer.

Therefore this adapter:

- never receives candidates already accepted by the Concised adapter;
- never selects among multiple Revised rows or readings;
- never uses definitions or examples to guess modernity;
- records every accepted Revised row as `provisional`.

## Official source

Discover the current version from the official download page:

- https://language.moe.gov.tw/001/Upload/Files/site_content/M0001/respub/dict_reviseddict_download.html

Pinned version:

- source version: `2015_20260625`
- download URL: `https://language.moe.gov.tw/001/Upload/Files/site_content/M0001/respub/download/dict_revised_2015_20260625.zip`
- outer ZIP SHA-256: `64003a98fcc7097940e5a536c999bc08ba7c07e2c1be66448f01bf1ae10a53fc`

The direct URL is a replay location, not a permanent discovery API. Check the
landing page before adopting a future revision.

## Observed archive schema

The pinned archive contains exactly two files.

### Main workbook

- member: `dict_revised_2015_20260625.xlsx`
- byte size: `31,186,920`
- SHA-256: `df94ae4384ae3f33f573ded5c2f142041ea7530d381a285163593d6252ea4a9a`
- worksheet: `1150625辭典匯出`
- used range: `A1:R163921`
- physical data rows: `163,920`

Exact headers, in order:

```text
字詞名
辭條別名
字數
字詞號
部首字
總筆畫數
部首外筆畫數
多音排序
注音一式
變體類型 1:變 2:又音 3:語音 4:讀音
變體注音
漢語拼音
變體漢語拼音
相似詞
相反詞
釋義
多音參見訊息
異體字
```

### Field guide workbook

- member: `dict_revised_2015_20260625_欄位說明.xlsx`
- byte size: `9,504`
- SHA-256: `1b36941248151516473f74f39db1f1095a22ba9367462c685d01a6ba03b191ca`

The field guide is checksum-verified as part of the archive identity but is not
used to produce product data.

## Selected source columns

| Column | Source field | Use |
|---|---|---|
| A | `字詞名` | exact source headword and normalized lookup key |
| D | `字詞號` | stable source identity |
| H | `多音排序` | deterministic diagnostic ordering |
| I | `注音一式` | exact source Bopomofo |
| Q | `多音參見訊息` | unresolved-reading diagnostic context |

`辭條別名`, `異體字`, definitions, examples, pinyin, synonyms, and antonyms are
not used by this adapter. Alias handling belongs to the later CC-CEDICT/identity
resolver so that exact-headword evidence and inferred aliases stay separate.

## Local replay

Store the archive under an ignored versioned path, for example:

```text
data/external/moe/revised/2015_20260625/source.zip
```

Then run:

```text
npm run readings:moe-revised -- \
  --archive data/external/moe/revised/2015_20260625/source.zip \
  --candidates data/source/words.sample.csv \
  --concised-projection data/readings/moe-concised-2014_20260626-active-catalog.json
```

## Fallback identity rules

The adapter reads the committed Concised projection first. It forms the Revised
candidate set only from Concised diagnostics that represent unresolved source
evidence:

- unmatched headword;
- duplicate source identity;
- multiple source readings;
- invalid Concised Bopomofo.

Duplicate candidate identities remain excluded and cannot enter fallback.
Concised accepted identities and fallback identities must be disjoint; overlap is
a hard error.

A Revised candidate is accepted only when:

- the candidate has one normalized catalog identity;
- the exact normalized Revised headword has one source row;
- the Bopomofo can be converted without guessing.

No `辭條別名`, traditional/modern classification, or definition-based heuristic
is used.

## First activation result (illustrative, now superseded by later batches)

Against the original 49-entry catalog, the Concised projection left eight
unresolved candidates:

```text
中文、台灣、很好、想要、東西、看到、聽到、謝謝
```

The pinned Revised source produced:

- accepted provisional fallback: `中文`, `謝謝`;
- multiple-reading (later resolved by manual review): `東西`;
- exact headword absent: `台灣`, `很好`, `想要`, `看到`, `聽到`;
- duplicate or malformed readings: none.

That gave two-tier MOE coverage of 43 of 49 catalog entries at the time
(41 authoritative Concised readings plus 2 provisional Revised readings). The
Concised/Revised split has grown with every later activation batch; check
`npm run app:catalog`'s printed summary for the current counts rather than a
number recorded here.

The remaining gaps are primarily identity/lexicalization problems. CC-CEDICT
now covers them: it contributes aliases and variant relationships without
replacing MOE readings, and (per `docs/reference-sources/cedict-local-identity-hints.md`)
real heteronyms with several CC-CEDICT readings are activated with every
distinct reading as its own entry. An existing entry for the same written text
does not suppress another reading; `東西`, for example, retains both
`ㄉㄨㄥ1 ㄒㄧ1` and `ㄉㄨㄥ1 ㄒㄧ5` without semantic selection.

## License and redistribution boundary

The MOE public authorization site identifies the dictionary as CC BY-ND 3.0
Taiwan. Repository policy remains conservative:

- do not commit the official ZIP, workbooks, definitions, examples, images, or a
  bulk rewritten dictionary;
- preserve exact source headword and Bopomofo evidence;
- commit only small candidate-scoped projections;
- keep lookup normalization and tone-number rendering in separate derived fields;
- record new checksums and review the schema for every revision;
- do not scrape the online dictionary or depend on a runtime API.

This engineering boundary is not legal advice. Reassess redistribution before
publishing a substantially larger MOE-derived projection.

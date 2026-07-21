# MOE Concised Dictionary reading source

Status: pinned source observation from 2026-07-22 (Asia/Taipei).

This document records the source boundary for using the Ministry of Education
《國語辭典簡編本》 as the primary Taiwan Mandarin headword and Bopomofo authority.
The official bulk archive remains local and is not committed to this repository.

## Source priority

Lexical evidence has separate owners:

1. **MOE Concised Dictionary** supplies the preferred Taiwan headword and Bopomofo reading.
2. **MOE Revised Dictionary** may later fill gaps, but its historical-language scope means every fallback must remain provisional.
3. **CC-CEDICT** may later supply traditional/simplified aliases, variant references, proper-name hints, classifier hints, and last-resort pinyin fallback. It must never override an MOE reading.
4. **NAER general frequency** supplies commonness only; it does not supply pronunciation or grammar.
5. **Product grammar rules** remain repository-owned derived metadata rather than dictionary facts.

## Official entry point

Discover the current version from the official download page:

- https://language.moe.gov.tw/001/Upload/Files/site_content/M0001/respub/dict_concised_download.html

The version observed for this adapter is:

- source version: `2014_20260626`
- download URL: `https://language.moe.gov.tw/001/Upload/Files/site_content/M0001/respub/download/dict_concised_2014_20260626.zip`
- outer ZIP SHA-256: `fc83d27eb3fbf6fcfdb791e7d05ef60946b58ef8e8857ed165b612217b392806`

The direct URL is a pinned replay location, not a permanent discovery API. Check the landing page before adopting a future revision.

## Observed archive and workbook schema

The pinned outer archive contains exactly one member:

- member: `dict_concised_2014_20260626.xlsx`
- byte size: `7,076,857`
- member SHA-256: `a9a4fd7259180113bfae2e94110eae87ac4dcf0bfcc91a6437c3ad4773ab7865`
- worksheet: `辭典匯出_1150626`
- visible used range: `A1:O45131`
- physical data rows: `45,130`

Exact headers, in order:

```text
字詞名
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
```

The first product adapter reads only:

| Column | Source field | Use |
|---|---|---|
| A | `字詞名` | exact source headword and normalized lookup key |
| B | `字詞號` | stable source-row identity |
| F | `多音排序` | diagnostic ordering only |
| G | `注音一式` | authoritative source Bopomofo |
| O | `多音參見訊息` | unresolved-reading diagnostic context |

Definitions, examples, synonyms, antonyms, pinyin, variants, audio, and images are not copied into the app artifact.

## Local download

Store the archive under a versioned ignored path, for example:

```text
data/external/moe/concised/2014_20260626/source.zip
```

PowerShell replay:

```powershell
$uri = 'https://language.moe.gov.tw/001/Upload/Files/site_content/M0001/respub/download/dict_concised_2014_20260626.zip'
$dest = 'data/external/moe/concised/2014_20260626/source.zip'
New-Item -ItemType Directory -Force (Split-Path $dest) | Out-Null
Invoke-WebRequest -Uri $uri -OutFile $dest
Get-FileHash -Algorithm SHA256 $dest
```

Then project only current candidate texts:

```text
npm run readings:moe-concised -- \
  --archive data/external/moe/concised/2014_20260626/source.zip \
  --candidates data/source/words.sample.csv
```

## Identity and ambiguity rules

The adapter keeps source evidence and lookup normalization separate:

```text
sourceHeadword = exact worksheet string
lookupText     = NFC(trim(sourceHeadword))
sourceBopomofo = exact worksheet string
trainerReading = deterministic tone-number rendering for the trainer
```

A candidate is accepted only when:

- exactly one normalized candidate identity exists;
- exactly one source row matches that normalized headword;
- the Bopomofo string can be converted without guessing.

The adapter excludes and reports:

- missing headwords;
- duplicate candidate identities;
- duplicate source identities even when their readings are equal;
- headwords with multiple source readings;
- unsupported or malformed Bopomofo.

No variant, heteronym, or multiple reading is selected automatically.

## Bopomofo conversion

The exact MOE string remains in `sourceBopomofo`. A separate deterministic transform creates the format already used by the trainer:

```text
ㄅㄚ　ㄅㄞˋ　ㄓ　ㄐㄧㄠ
→ ㄅㄚ1 ㄅㄞ4 ㄓ1 ㄐㄧㄠ1

ㄇㄚ　˙ㄇㄚ
→ ㄇㄚ1 ㄇㄚ5
```

This transform changes notation only; it does not infer sandhi or choose among readings.

## License and redistribution boundary

The official public-authorization page identifies the dictionaries as
**CC BY-ND 3.0 Taiwan** and permits reproduction, distribution, transmission,
and commercial use while prohibiting modification and requiring attribution and
compliance with the usage instructions.

Repository policy for this source is intentionally conservative:

- do not commit the official ZIP, XLSX, definitions, examples, audio, images, or a bulk rewritten dictionary;
- keep exact source headword and reading evidence traceable to source version and entry ID;
- commit only small candidate-scoped projections needed by the product;
- keep product-derived lookup keys, tone-number rendering, commonness, and grammar metadata in separate fields;
- record a new checksum and schema review for every source revision;
- do not scrape the online dictionary or depend on an unofficial runtime API.

This engineering boundary is not legal advice. Reassess the redistribution plan before publishing a substantially larger MOE-derived artifact.

## Why CC-CEDICT is not the reading authority

CC-CEDICT is useful later because its structured line format exposes traditional and simplified headwords, numbered pinyin, references such as `variant of`, and classifiers. However:

- its primary pronunciation follows PRC standard Mandarin;
- Taiwan pronunciation notes are incomplete by design;
- English glosses are not a formal part-of-speech schema;
- heuristic grammar hints must remain lower-confidence repository-derived metadata.

Therefore the merge order is:

```text
NAER candidate/commonness
→ MOE Concised exact headword and reading
→ MOE Revised provisional fallback (later)
→ CC-CEDICT aliases and final fallback (later)
→ repository-owned coarse grammar rules
```

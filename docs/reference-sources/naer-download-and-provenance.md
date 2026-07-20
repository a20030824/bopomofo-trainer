# NAER frequency-source download and provenance

Status: research snapshot observed on 2026-07-21 (Asia/Taipei).

This document records how to obtain the current National Academy for Educational Research (NAER) Taiwan Mandarin word lists without committing the official bulk files to this repository. Direct file URLs are version observations, not permanent API contracts.

## Stable entry point

Use the official document-download page as the canonical discovery URL:

- https://coct.naer.edu.tw/page.jsp?ID=41

Under **詞語表、類詞綴表、通用詞頻表**, the page currently offers:

- 三等七級詞語表: PDF, XLSX, and ODS;
- 通用詞頻表: XLSX and ODS.

The site operation guide states that clicking a filename on the document-download page downloads the file:

- https://coct.naer.edu.tw/page.jsp?ID=57

Always rediscover files from the landing page before an import. The direct paths below may change when NAER publishes a new revision.

## Direct URLs observed on 2026-07-21

### General frequency table

Observed XLSX filename: `通用詞頻表 - 定稿1141208.xlsx`

- https://coct.naer.edu.tw/file/files/%E9%80%9A%E7%94%A8%E8%A9%9E%E9%A0%BB%E8%A1%A8%20-%20%E5%AE%9A%E7%A8%BF1141208.xlsx

Observed ODS filename: `通用詞頻表 - 定稿1141208.ods`

- https://coct.naer.edu.tw/file/files/%E9%80%9A%E7%94%A8%E8%A9%9E%E9%A0%BB%E8%A1%A8%20-%20%E5%AE%9A%E7%A8%BF1141208.ods

`1141208` appears to be a Republic of China calendar date corresponding to 2025-12-08. Treat that interpretation as filename metadata until confirmed inside the workbook.

### Three-band, seven-level word list

Observed XLSX filename: `14452詞語表202504.xlsx`

- https://coct.naer.edu.tw/file/files/14452%E8%A9%9E%E8%AA%9E%E8%A1%A8202504.xlsx

The filename suggests an April 2025 revision and 14,452 entries. The public query system currently reports 14,449 results, so version drift must be expected rather than silently reconciled:

- https://coct.naer.edu.tw/word.jsp

## Recommended browser download

1. Open the stable entry page.
2. Find **通用詞頻表（xlsx 格式）**.
3. Save the file under a versioned local path such as:

   `data/external/naer/coct-general-frequency/2025-12-08/source.xlsx`

4. Download **三等七級詞語表（xlsx 格式）** separately when pronunciation, level, or situation metadata is needed:

   `data/external/naer/tbcl-word-list/2025-04/source.xlsx`

5. Do not overwrite an older version. A source update is a new provenance record and should be compared explicitly.

The `data/external/` directory is local-only and must remain ignored by Git.

## Optional PowerShell download

The browser route is preferred because the landing page reveals revisions. For a pinned replay, PowerShell can use the observed direct URL:

```powershell
$uri = 'https://coct.naer.edu.tw/file/files/%E9%80%9A%E7%94%A8%E8%A9%9E%E9%A0%BB%E8%A1%A8%20-%20%E5%AE%9A%E7%A8%BF1141208.xlsx'
$dest = 'data/external/naer/coct-general-frequency/2025-12-08/source.xlsx'
New-Item -ItemType Directory -Force (Split-Path $dest) | Out-Null
Invoke-WebRequest -Uri $uri -OutFile $dest
Get-FileHash -Algorithm SHA256 $dest
Get-Item $dest | Select-Object FullName, Length, LastWriteTimeUtc
```

A command-line failure is not evidence that the file was removed; retry through the official landing page and record any redirected URL.

## Provenance record

Create a local metadata record next to every downloaded file. Required fields:

```json
{
  "sourceId": "naer:coct-general-frequency",
  "landingUrl": "https://coct.naer.edu.tw/page.jsp?ID=41",
  "downloadUrl": "<resolved URL used for this retrieval>",
  "observedFilename": "通用詞頻表 - 定稿1141208.xlsx",
  "retrievedAt": "<UTC ISO-8601 timestamp>",
  "byteSize": 0,
  "checksumSha256": "<lowercase SHA-256>",
  "mediaType": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "redistributionStatus": "local-only-pending-license-review",
  "inspectionStatus": "not-inspected"
}
```

Never infer retrieval time from the source filename. Record the actual download time separately.

## Binary validation before column analysis

Before trusting a workbook:

1. verify that the file is non-empty;
2. verify its SHA-256 and byte size;
3. confirm that XLSX begins as a ZIP/Open Packaging Convention file rather than an HTML error page;
4. list sheet names, visible/hidden state, used ranges, merged cells, formulas, and header candidates;
5. record exact header text and cell types without renaming them;
6. count physical rows, blank rows, duplicate rows, and rows with missing identity/frequency values;
7. compare workbook counts with the public query system, but do not force them to match;
8. pin the inspected workbook checksum in any future adapter fixture report.

The direct binaries were not inspected in this research PR. Therefore, this PR does not claim verified workbook sheet names or column schemas.

## Redistribution boundary

The official pages identify NAER copyright and do not expose an open-data license beside these downloads. Until an explicit license or permission is recorded:

- keep original files local;
- do not commit bulk derived copies;
- commit only hand-authored fixtures and structural observations;
- mark manifests as `local-only` or `local-only-pending-license-review`;
- keep source URLs and checksums so another researcher can reproduce the acquisition.

## Related authoritative context

NAER describes the public word-level query output as including level, situation, pronunciation, and spoken/written frequency per million:

- https://coct.naer.edu.tw/word.jsp

NAER also explains that the graded word list was selected using written-corpus frequency, coverage, and distribution evenness, then adjusted with spoken-frequency information and expert teaching judgment:

- https://epaper.naer.edu.tw/edm?content_no=4093&edm_no=239&grp_no=1

These facts support the commonness research, but they do not prove the exact columns of the downloadable general-frequency workbook.
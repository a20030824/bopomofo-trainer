# NAER general-frequency workbook inspection runbook

## Purpose

This runbook turns the source research in `naer-download-and-provenance.md` into a reproducible structural inspection without committing the official workbook or any lexical rows.

The inspector has already been exercised against the observed NAER XLSX in an earlier temporary CI run. The permanent workflow is local-first because GitHub-hosted Actions quota must not be used for source exploration.

## Source discovery

Rediscover the current workbook from the official landing page before every inspection:

- `https://coct.naer.edu.tw/page.jsp?ID=41`

The revision observed on 2026-07-21 was:

- `通用詞頻表 - 定稿1141208.xlsx`
- `https://coct.naer.edu.tw/file/files/%E9%80%9A%E7%94%A8%E8%A9%9E%E9%A0%BB%E8%A1%A8%20-%20%E5%AE%9A%E7%A8%BF1141208.xlsx`

A direct URL is a pinned observation, not a permanent API contract.

## Local inspection

From the repository root:

```powershell
$uri = 'https://coct.naer.edu.tw/file/files/%E9%80%9A%E7%94%A8%E8%A9%9E%E9%A0%BB%E8%A1%A8%20-%20%E5%AE%9A%E7%A8%BF1141208.xlsx'
$out = 'data/reference-generated/naer-general-frequency/2025-12-08'
py scripts/run-naer-frequency-workbook-inspection.py --url $uri --output-dir $out
```

The output directory is ignored by Git. The command downloads the workbook into a temporary directory, validates its XLSX ZIP structure, computes provenance and SHA-256, emits aggregate structural reports, and deletes the source workbook when the process exits.

Generated files:

- `naer-frequency-workbook-inspection.json`
- `naer-frequency-workbook-inspection.md`
- `naer-frequency-workbook-manifest.json`

No `.xlsx` file may appear in the output directory.

## Review gate

Before committing a report, verify all of the following:

1. the landing page still points to the observed revision or the manifest records a new revision;
2. the filename, resolved URL, byte size, retrieval timestamp, and SHA-256 are populated;
3. every sheet name, visibility state, used range, merged-cell count, formula count, and detected header row is present;
4. exact header labels are preserved without adapter-oriented renaming;
5. null counts and numeric-zero counts are distinct;
6. duplicate rows and missing identity rows are counted;
7. lexical identity, spoken frequency, written frequency, general frequency, rank/source ID, reading, part of speech, level, and domain are marked present only from observed headers;
8. no lexical row or word-linked example frequency is present;
9. redistribution remains `local-only-pending-license-review` unless an explicit official license is recorded.

## Committed result

After review, commit only the aggregate report and manifest under `docs/reference-sources/inspection/`. Do not commit the source workbook or a bulk derived table.

The committed report must conclude whether the workbook is sufficient for the first product commonness score and list every unresolved adapter issue, especially:

- lexical row identity;
- duplicate or variant spellings;
- heteronym aggregation;
- spoken versus written frequency semantics;
- zero versus missing frequency;
- stable source identifiers;
- redistribution permission.

## Verification without Actions

The inspector uses only Python's standard library. Verify it locally before pushing:

```powershell
py -m py_compile scripts/inspect-naer-frequency-workbook.py
py -m py_compile scripts/run-naer-frequency-workbook-inspection.py
```

Run the real inspection once, review the three aggregate outputs, then push the complete report as one logical commit. Do not create a CI-only network test and do not push repeatedly to debug source access.

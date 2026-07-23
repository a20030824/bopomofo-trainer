#!/usr/bin/env python3
"""Project deterministic ranked lexical candidates from the pinned NAER workbook.

The official workbook remains local. This adapter reuses the checksum/schema-locked
NAER reader and emits only candidate-scoped CSV plus aggregate metadata.

Strict mode preserves the historical top-N contract and rejects candidate-content
anomalies. Report mode keeps source-integrity checks fail-fast, excludes invalid
candidate rows deterministically, and writes a machine-readable eligibility report.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import importlib.util
import json
import sys
import unicodedata
import zipfile
from collections import Counter
from pathlib import Path
from types import ModuleType
from typing import Any, Literal

ADAPTER_VERSION = "naer-lexicon-candidates-adapter-v1"
REPORT_MODE_ADAPTER_VERSION = "naer-lexicon-candidates-adapter-v2"
ELIGIBILITY_REPORT_VERSION = "naer-lexicon-eligibility-report-v1"
DEFAULT_WORKBOOK = Path("data/external/naer/1141208/通用詞頻表.xlsx")
InvalidRowPolicy = Literal["error", "report"]


def load_naer_adapter() -> ModuleType:
    path = Path(__file__).with_name("project-naer-commonness.py")
    specification = importlib.util.spec_from_file_location(
        "project_naer_commonness_for_lexicon_candidates",
        path,
    )
    if specification is None or specification.loader is None:
        raise RuntimeError(f"cannot load NAER adapter: {path}")
    module = importlib.util.module_from_spec(specification)
    sys.modules[specification.name] = module
    specification.loader.exec_module(module)
    return module


def is_han_character(character: str) -> bool:
    name = unicodedata.name(character, "")
    return name.startswith("CJK UNIFIED IDEOGRAPH") or name.startswith(
        "CJK COMPATIBILITY IDEOGRAPH"
    )


def is_pure_han(text: str) -> bool:
    return bool(text) and all(is_han_character(character) for character in text)


def canonical_digest(value: Any) -> str:
    encoded = json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def exclusion(
    *,
    reason: str,
    general_rank: int,
    source_physical_row: int,
    raw_lexical_text: object,
    normalized_lexical_text: str | None = None,
    duplicate_of_general_rank: int | None = None,
) -> dict[str, Any]:
    result: dict[str, Any] = {
        "reason": reason,
        "generalRank": general_rank,
        "sourcePhysicalRow": source_physical_row,
        "rawLexicalText": raw_lexical_text,
    }
    if normalized_lexical_text is not None:
        result["normalizedLexicalText"] = normalized_lexical_text
    if duplicate_of_general_rank is not None:
        result["duplicateOfGeneralRank"] = duplicate_of_general_rank
    return result


def raise_candidate_content_error(exclusions: list[dict[str, Any]]) -> None:
    non_han = [
        row.get("normalizedLexicalText")
        for row in exclusions
        if row["reason"] == "non-han-text"
    ]
    if non_han:
        raise ValueError(f"top candidates contain non-Han lexical texts: {non_han!r}")
    duplicate_texts = sorted({
        str(row.get("normalizedLexicalText"))
        for row in exclusions
        if row["reason"] == "duplicate-normalized-text"
    })
    if duplicate_texts:
        raise ValueError(f"duplicate normalized lexical texts: {duplicate_texts!r}")
    first = exclusions[0]
    raise ValueError(
        "top candidate contains invalid lexical text at "
        f"rank {first['generalRank']}: {first['reason']}"
    )


def project_top_candidates(
    workbook_path: Path,
    limit: int,
    *,
    adapter: ModuleType | None = None,
    invalid_row_policy: InvalidRowPolicy = "error",
) -> dict[str, Any]:
    if limit <= 0:
        raise ValueError("limit must be a positive integer")
    if invalid_row_policy not in {"error", "report"}:
        raise ValueError(f"unsupported invalid row policy: {invalid_row_policy}")

    source = adapter or load_naer_adapter()
    checksum = source.sha256_file(workbook_path)
    if checksum != source.EXPECTED_SHA256:
        raise ValueError(f"NAER workbook checksum mismatch: {checksum}")

    prefix_rows: list[dict[str, Any]] = []
    source_row_count = 0
    with zipfile.ZipFile(workbook_path) as archive:
        shared_strings = source.read_shared_strings(archive)
        sheet_name, sheet_path = source.workbook_sheet(archive)
        if sheet_name != source.EXPECTED_SHEET:
            raise ValueError(f"NAER workbook sheet mismatch: {sheet_name!r}")
        sheet_bytes = archive.read(sheet_path)

        from xml.etree import ElementTree as ET

        dimension = ET.fromstring(sheet_bytes).find(source.q(source.MAIN, "dimension"))
        dimension_reference = dimension.attrib.get("ref") if dimension is not None else None
        if dimension_reference != source.EXPECTED_DIMENSION:
            raise ValueError(f"NAER workbook dimension mismatch: {dimension_reference!r}")

        rows = source.iter_rows(sheet_bytes, shared_strings)
        header_row_number, header_cells = next(rows)
        headers = [
            header_cells[index].value if index in header_cells else None
            for index in range(1, 13)
        ]
        if header_row_number != 1 or headers != source.EXPECTED_HEADERS:
            raise ValueError(f"NAER workbook headers mismatch: {headers!r}")

        for physical_row_number, cells in rows:
            source_row_count += 1
            rank = source.numeric(
                cells[1].value if 1 in cells else None,
                f"A{physical_row_number}",
                integer=True,
            )
            if rank is None or rank > limit:
                continue
            prefix_rows.append(
                {
                    "generalRank": rank,
                    "rawLexicalText": cells[2].value if 2 in cells else None,
                    "writtenPerMillion": source.numeric(
                        cells[4].value if 4 in cells else None,
                        f"D{physical_row_number}",
                    ),
                    "spokenPerMillion": source.numeric(
                        cells[7].value if 7 in cells else None,
                        f"G{physical_row_number}",
                    ),
                    "sourcePhysicalRow": physical_row_number,
                }
            )

    prefix_rows.sort(key=lambda item: item["generalRank"])
    observed_ranks = [item["generalRank"] for item in prefix_rows]
    expected_ranks = list(range(1, limit + 1))
    if observed_ranks != expected_ranks:
        raise ValueError(
            "NAER top-rank prefix is not continuous: "
            f"expected 1..{limit}, observed {observed_ranks[:10]!r}..."
        )

    selected: list[dict[str, Any]] = []
    exclusions: list[dict[str, Any]] = []
    first_rank_by_text: dict[str, int] = {}
    for row in prefix_rows:
        rank = row["generalRank"]
        physical_row = row["sourcePhysicalRow"]
        raw_text = row["rawLexicalText"]
        if not isinstance(raw_text, str):
            exclusions.append(exclusion(
                reason="invalid-lexical-text",
                general_rank=rank,
                source_physical_row=physical_row,
                raw_lexical_text=raw_text,
            ))
            continue
        lexical_text = source.normalize_lexical_text(raw_text)
        if not lexical_text:
            exclusions.append(exclusion(
                reason="empty-normalized-text",
                general_rank=rank,
                source_physical_row=physical_row,
                raw_lexical_text=raw_text,
                normalized_lexical_text=lexical_text,
            ))
            continue
        if not is_pure_han(lexical_text):
            exclusions.append(exclusion(
                reason="non-han-text",
                general_rank=rank,
                source_physical_row=physical_row,
                raw_lexical_text=raw_text,
                normalized_lexical_text=lexical_text,
            ))
            continue
        duplicate_of = first_rank_by_text.get(lexical_text)
        if duplicate_of is not None:
            exclusions.append(exclusion(
                reason="duplicate-normalized-text",
                general_rank=rank,
                source_physical_row=physical_row,
                raw_lexical_text=raw_text,
                normalized_lexical_text=lexical_text,
                duplicate_of_general_rank=duplicate_of,
            ))
            continue
        first_rank_by_text[lexical_text] = rank
        selected.append(
            {
                "generalRank": rank,
                "lexicalText": lexical_text,
                "writtenPerMillion": row["writtenPerMillion"],
                "spokenPerMillion": row["spokenPerMillion"],
                "sourcePhysicalRow": physical_row,
            }
        )

    if exclusions and invalid_row_policy == "error":
        raise_candidate_content_error(exclusions)

    length_distribution = Counter(len(item["lexicalText"]) for item in selected)
    digest_rows = [
        {
            "generalRank": item["generalRank"],
            "lexicalText": item["lexicalText"],
            "spokenPerMillion": item["spokenPerMillion"],
            "writtenPerMillion": item["writtenPerMillion"],
        }
        for item in selected
    ]
    source_metadata = {
        "sourceId": source.SOURCE_ID,
        "sourceVersion": source.SOURCE_VERSION,
        "checksumSha256": checksum,
        "sheetName": source.EXPECTED_SHEET,
        "dimension": source.EXPECTED_DIMENSION,
        "headers": source.EXPECTED_HEADERS,
        "selectedColumns": {
            "generalRank": "A",
            "lexicalText": "B",
            "writtenPerMillion": "D",
            "spokenPerMillion": "G",
        },
        "redistributionBoundary": (
            "official workbook remains local; committed output is limited to the "
            "selected ranked prefix and aggregate metadata"
        ),
    }

    if invalid_row_policy == "error":
        return {
            "adapterVersion": ADAPTER_VERSION,
            "source": source_metadata,
            "selection": {
                "rule": "continuous ascending general rank prefix",
                "limit": limit,
                "selectedCount": len(selected),
                "normalizedTextCount": len(first_rank_by_text),
                "pureHanRequired": True,
                "lengthDistribution": {
                    str(length): count for length, count in sorted(length_distribution.items())
                },
                "determinismDigest": canonical_digest(digest_rows),
            },
            "rows": selected,
            "diagnostics": {
                "sourceRowCount": source_row_count,
                "duplicateNormalizedTexts": [],
                "nonHanTexts": [],
                "omittedSourceRowCount": source_row_count - len(selected),
            },
        }

    reason_counts = Counter(str(row["reason"]) for row in exclusions)
    eligibility_core = {
        "requestedRankLimit": limit,
        "sourcePrefixCount": len(prefix_rows),
        "eligibleCount": len(selected),
        "excludedCount": len(exclusions),
        "exclusionReasonCounts": {
            reason: reason_counts[reason] for reason in sorted(reason_counts)
        },
    }
    return {
        "adapterVersion": REPORT_MODE_ADAPTER_VERSION,
        "source": source_metadata,
        "selection": {
            "rule": "eligible rows from a continuous ascending general rank prefix",
            "limit": limit,
            "sourcePrefixCount": len(prefix_rows),
            "selectedCount": len(selected),
            "normalizedTextCount": len(first_rank_by_text),
            "pureHanRequired": True,
            "excludedCount": len(exclusions),
            "exclusionReasonCounts": eligibility_core["exclusionReasonCounts"],
            "lengthDistribution": {
                str(length): count for length, count in sorted(length_distribution.items())
            },
            "determinismDigest": canonical_digest(digest_rows),
        },
        "rows": selected,
        "eligibilityReport": {
            "adapterVersion": ELIGIBILITY_REPORT_VERSION,
            "sourceId": source.SOURCE_ID,
            "sourceVersion": source.SOURCE_VERSION,
            **eligibility_core,
            "exclusions": exclusions,
            "determinismDigest": canonical_digest({
                **eligibility_core,
                "exclusions": exclusions,
            }),
        },
        "diagnostics": {
            "sourceRowCount": source_row_count,
            "sourcePrefixCount": len(prefix_rows),
            "eligibleCount": len(selected),
            "excludedCount": len(exclusions),
            "omittedOutsidePrefixRowCount": source_row_count - len(prefix_rows),
        },
    }


def write_candidate_csv(payload: dict[str, Any], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as destination:
        writer = csv.DictWriter(
            destination,
            fieldnames=[
                "text",
                "status",
                "naer_general_rank",
                "written_per_million",
                "spoken_per_million",
                "provenance_ids",
            ],
        )
        writer.writeheader()
        for row in payload["rows"]:
            writer.writerow(
                {
                    "text": row["lexicalText"],
                    "status": "provisional",
                    "naer_general_rank": row["generalRank"],
                    "written_per_million": (
                        "" if row["writtenPerMillion"] is None else row["writtenPerMillion"]
                    ),
                    "spoken_per_million": (
                        "" if row["spokenPerMillion"] is None else row["spokenPerMillion"]
                    ),
                    "provenance_ids": payload["source"]["sourceId"],
                }
            )


def default_report_path(manifest_path: Path) -> Path:
    name = manifest_path.name
    if name.endswith("-manifest.json"):
        name = f"{name[:-len('-manifest.json')]}-eligibility-report.json"
    else:
        name = f"{manifest_path.stem}-eligibility-report.json"
    return manifest_path.with_name(name)


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--workbook", type=Path, default=DEFAULT_WORKBOOK)
    parser.add_argument("--limit", type=int, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--manifest-output", type=Path, required=True)
    parser.add_argument(
        "--invalid-row-policy",
        choices=("error", "report"),
        default="error",
    )
    parser.add_argument("--report-output", type=Path)
    arguments = parser.parse_args()

    payload = project_top_candidates(
        arguments.workbook,
        arguments.limit,
        invalid_row_policy=arguments.invalid_row_policy,
    )
    write_candidate_csv(payload, arguments.output)
    manifest_payload = dict(payload)
    eligibility_report = manifest_payload.pop("eligibilityReport", None)
    write_json(arguments.manifest_output, manifest_payload)
    if eligibility_report is not None:
        report_output = arguments.report_output or default_report_path(arguments.manifest_output)
        write_json(report_output, eligibility_report)

    selected_count = payload["selection"]["selectedCount"]
    excluded_count = payload["selection"].get("excludedCount", 0)
    print(
        f"wrote {selected_count} eligible ranked candidates; "
        f"excluded {excluded_count}; "
        f"digest {payload['selection']['determinismDigest']}"
    )


if __name__ == "__main__":
    main()

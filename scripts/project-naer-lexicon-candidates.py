#!/usr/bin/env python3
"""Project a deterministic top-N lexical candidate set from the pinned NAER workbook.

The official workbook remains local. This adapter reuses the checksum/schema-locked
NAER reader, selects a continuous general-rank prefix, and emits only candidate-
scoped CSV plus an aggregate manifest. No complete workbook rows are redistributed.
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
from typing import Any

ADAPTER_VERSION = "naer-lexicon-candidates-adapter-v1"
DEFAULT_LIMIT = 1_000
DEFAULT_WORKBOOK = Path("data/external/naer/1141208/通用詞頻表.xlsx")
DEFAULT_OUTPUT = Path("data/lexicon/naer-1141208-top-1000-candidates.csv")
DEFAULT_MANIFEST = Path("data/lexicon/naer-1141208-top-1000-manifest.json")


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


def canonical_digest(rows: list[dict[str, Any]]) -> str:
    encoded = json.dumps(
        rows,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def project_top_candidates(
    workbook_path: Path,
    limit: int,
    *,
    adapter: ModuleType | None = None,
) -> dict[str, Any]:
    if limit <= 0:
        raise ValueError("limit must be a positive integer")
    source = adapter or load_naer_adapter()
    checksum = source.sha256_file(workbook_path)
    if checksum != source.EXPECTED_SHA256:
        raise ValueError(f"NAER workbook checksum mismatch: {checksum}")

    selected: list[dict[str, Any]] = []
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
            lexical_value = cells[2].value if 2 in cells else None
            if not isinstance(lexical_value, str):
                raise ValueError(f"B{physical_row_number} must contain lexical text")
            lexical_text = source.normalize_lexical_text(lexical_value)
            if rank is None or rank > limit:
                continue
            selected.append(
                {
                    "generalRank": rank,
                    "lexicalText": lexical_text,
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

    selected.sort(key=lambda item: (item["generalRank"], item["lexicalText"]))
    observed_ranks = [item["generalRank"] for item in selected]
    expected_ranks = list(range(1, limit + 1))
    if observed_ranks != expected_ranks:
        raise ValueError(
            "NAER top-rank prefix is not continuous: "
            f"expected 1..{limit}, observed {observed_ranks[:10]!r}..."
        )

    lexical_counts = Counter(item["lexicalText"] for item in selected)
    duplicate_texts = sorted(text for text, count in lexical_counts.items() if count > 1)
    if duplicate_texts:
        raise ValueError(f"duplicate normalized lexical texts: {duplicate_texts!r}")

    non_han = [item["lexicalText"] for item in selected if not is_pure_han(item["lexicalText"])]
    if non_han:
        raise ValueError(f"top candidates contain non-Han lexical texts: {non_han!r}")

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
    return {
        "adapterVersion": ADAPTER_VERSION,
        "source": {
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
        },
        "selection": {
            "rule": "continuous ascending general rank prefix",
            "limit": limit,
            "selectedCount": len(selected),
            "normalizedTextCount": len(lexical_counts),
            "pureHanRequired": True,
            "lengthDistribution": {
                str(length): count for length, count in sorted(length_distribution.items())
            },
            "determinismDigest": canonical_digest(digest_rows),
        },
        "rows": selected,
        "diagnostics": {
            "sourceRowCount": source_row_count,
            "duplicateNormalizedTexts": duplicate_texts,
            "nonHanTexts": non_han,
            "omittedSourceRowCount": source_row_count - len(selected),
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


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--workbook", type=Path, default=DEFAULT_WORKBOOK)
    parser.add_argument("--limit", type=int, default=DEFAULT_LIMIT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--manifest-output", type=Path, default=DEFAULT_MANIFEST)
    arguments = parser.parse_args()

    payload = project_top_candidates(arguments.workbook, arguments.limit)
    write_candidate_csv(payload, arguments.output)
    arguments.manifest_output.parent.mkdir(parents=True, exist_ok=True)
    arguments.manifest_output.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(
        f"wrote {payload['selection']['selectedCount']} ranked candidates; "
        f"digest {payload['selection']['determinismDigest']}"
    )


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Extract catalog-scoped rows from the pinned NAER general-frequency XLSX.

The official workbook remains local. This tool verifies the exact workbook
identity, streams only A/B/D/G, and writes a small active-catalog artifact. It
never emits the complete 163,701-row lexical table.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import posixpath
import re
import unicodedata
import zipfile
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
from typing import Any, Iterator
from xml.etree import ElementTree as ET

MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
DOC_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PKG_REL = "http://schemas.openxmlformats.org/package/2006/relationships"

SOURCE_ID = "naer:coct-general-frequency"
SOURCE_VERSION = "1141208"
ADAPTER_VERSION = "naer-general-frequency-adapter-v1"
EXPECTED_SHA256 = "bfd3b73938e115ae39a44c5e11c97135c09939cf598157cb2fe0b33c4302de75"
EXPECTED_SHEET = "通用詞頻表"
EXPECTED_DIMENSION = "A1:L163702"
EXPECTED_HEADERS = [
    "綜合\n序位",
    "詞",
    "書面語\n詞頻",
    "書面語\n每百萬詞頻",
    "書面語\n序位",
    "口語\n詞頻",
    "口語\n每百萬詞頻",
    "口語\n序位",
    "新聞\n詞頻",
    "新聞\n每百萬詞頻",
    "新聞\n序位",
    "每百萬詞頻\n(平均)",
]


def q(namespace: str, name: str) -> str:
    return f"{{{namespace}}}{name}"


def text_content(element: ET.Element | None) -> str:
    return "" if element is None else "".join(element.itertext())


def normalize_target(base: str, target: str) -> str:
    if target.startswith("/"):
        return target.lstrip("/")
    return posixpath.normpath(posixpath.join(base, target))


def normalize_lexical_text(value: str) -> str:
    return unicodedata.normalize("NFC", value.strip())


def excel_column_index(reference: str) -> int:
    match = re.match(r"([A-Z]+)", reference.upper())
    if match is None:
        raise ValueError(f"invalid cell reference: {reference}")
    result = 0
    for character in match.group(1):
        result = result * 26 + ord(character) - ord("A") + 1
    return result


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_shared_strings(archive: zipfile.ZipFile) -> list[str]:
    path = "xl/sharedStrings.xml"
    if path not in archive.namelist():
        return []
    root = ET.fromstring(archive.read(path))
    return [text_content(item) for item in root.findall(q(MAIN, "si"))]


def workbook_sheet(archive: zipfile.ZipFile) -> tuple[str, str]:
    root = ET.fromstring(archive.read("xl/workbook.xml"))
    relationships_root = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
    relationships = {
        item.attrib["Id"]: normalize_target("xl", item.attrib["Target"])
        for item in relationships_root.findall(q(PKG_REL, "Relationship"))
    }
    sheets_element = root.find(q(MAIN, "sheets"))
    sheets = [] if sheets_element is None else list(sheets_element)
    if len(sheets) != 1:
        raise ValueError(f"expected exactly one worksheet, found {len(sheets)}")
    sheet = sheets[0]
    name = sheet.attrib.get("name", "")
    relationship_id = sheet.attrib.get(q(DOC_REL, "id"), "")
    path = relationships.get(relationship_id)
    if path is None:
        raise ValueError("worksheet relationship is missing")
    return name, path


@dataclass(frozen=True)
class Cell:
    column: int
    value: Any


def decode_cell(cell: ET.Element, shared_strings: list[str]) -> Cell:
    reference = cell.attrib.get("r", "")
    column = excel_column_index(reference)
    cell_type = cell.attrib.get("t", "n")
    raw = text_content(cell.find(q(MAIN, "v")))
    if cell_type == "s":
        try:
            value: Any = shared_strings[int(raw)]
        except (ValueError, IndexError):
            value = None
    elif cell_type == "inlineStr":
        value = text_content(cell.find(q(MAIN, "is")))
    elif cell_type in {"str", "e"}:
        value = raw or None
    elif raw == "":
        value = None
    else:
        try:
            number = float(raw)
        except ValueError as error:
            raise ValueError(f"non-numeric workbook value at {reference}: {raw!r}") from error
        value = int(number) if number.is_integer() else number
    return Cell(column, value)


def iter_rows(sheet_bytes: bytes, shared_strings: list[str]) -> Iterator[tuple[int, dict[int, Cell]]]:
    for _, element in ET.iterparse(BytesIO(sheet_bytes), events=("end",)):
        if element.tag != q(MAIN, "row"):
            continue
        row_number = int(element.attrib.get("r", "0") or 0)
        cells = {
            decoded.column: decoded
            for decoded in (decode_cell(cell, shared_strings) for cell in element.findall(q(MAIN, "c")))
        }
        yield row_number, cells
        element.clear()


def numeric(value: Any, label: str, *, integer: bool = False) -> int | float | None:
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{label} must be numeric or blank")
    number = float(value)
    if not math.isfinite(number) or number < 0:
        raise ValueError(f"{label} must be finite and non-negative")
    if integer:
        if not number.is_integer() or number <= 0:
            raise ValueError(f"{label} must be a positive integer")
        return int(number)
    return int(number) if number.is_integer() else number


def catalog_texts(path: Path) -> tuple[list[str], dict[str, int]]:
    normalized_texts: list[str] = []
    counts: dict[str, int] = {}
    with path.open("r", encoding="utf-8-sig", newline="") as source:
        for row_number, row in enumerate(csv.DictReader(source), start=2):
            if (row.get("status") or "") == "excluded":
                continue
            raw_text = row.get("text") or ""
            text = normalize_lexical_text(raw_text)
            if not text:
                raise ValueError(f"catalog row {row_number} is missing text")
            normalized_texts.append(text)
            counts[text] = counts.get(text, 0) + 1
    return normalized_texts, counts


def extract_catalog_rows(workbook_path: Path, catalog_path: Path) -> dict[str, Any]:
    checksum = sha256_file(workbook_path)
    if checksum != EXPECTED_SHA256:
        raise ValueError(f"NAER workbook checksum mismatch: {checksum}")

    catalog_items, catalog_counts = catalog_texts(catalog_path)
    target_texts = set(catalog_items)
    matched_rows: dict[str, dict[str, Any]] = {}
    source_row_count = 0

    with zipfile.ZipFile(workbook_path) as archive:
        shared_strings = read_shared_strings(archive)
        sheet_name, sheet_path = workbook_sheet(archive)
        if sheet_name != EXPECTED_SHEET:
            raise ValueError(f"NAER workbook sheet mismatch: {sheet_name!r}")

        sheet_bytes = archive.read(sheet_path)
        sheet_root = ET.fromstring(sheet_bytes)
        dimension = sheet_root.find(q(MAIN, "dimension"))
        dimension_reference = dimension.attrib.get("ref") if dimension is not None else None
        if dimension_reference != EXPECTED_DIMENSION:
            raise ValueError(f"NAER workbook dimension mismatch: {dimension_reference!r}")

        rows = iter_rows(sheet_bytes, shared_strings)
        header_row_number, header_cells = next(rows)
        headers = [header_cells[index].value if index in header_cells else None for index in range(1, 13)]
        if header_row_number != 1 or headers != EXPECTED_HEADERS:
            raise ValueError(f"NAER workbook headers mismatch: {headers!r}")

        for physical_row_number, cells in rows:
            source_row_count += 1
            rank = numeric(
                cells[1].value if 1 in cells else None,
                f"A{physical_row_number}",
                integer=True,
            )
            lexical_value = cells[2].value if 2 in cells else None
            if not isinstance(lexical_value, str):
                raise ValueError(f"B{physical_row_number} must contain lexical text")
            lexical_text = normalize_lexical_text(lexical_value)
            if lexical_text not in target_texts:
                continue
            if lexical_text in matched_rows:
                raise ValueError(f"duplicate NAER lexical text after normalization: {lexical_text}")
            matched_rows[lexical_text] = {
                "generalRank": rank,
                "lexicalText": lexical_text,
                "writtenPerMillion": numeric(
                    cells[4].value if 4 in cells else None,
                    f"D{physical_row_number}",
                ),
                "spokenPerMillion": numeric(
                    cells[7].value if 7 in cells else None,
                    f"G{physical_row_number}",
                ),
            }

    rows = sorted(
        matched_rows.values(),
        key=lambda item: (item["generalRank"], item["lexicalText"]),
    )
    unmatched_catalog_texts = sorted(text for text in target_texts if text not in matched_rows)
    ambiguous_catalog_texts = sorted(text for text, count in catalog_counts.items() if count > 1)

    return {
        "adapterVersion": ADAPTER_VERSION,
        "source": {
            "sourceId": SOURCE_ID,
            "sourceVersion": SOURCE_VERSION,
            "checksumSha256": checksum,
            "sheetName": EXPECTED_SHEET,
            "dimension": EXPECTED_DIMENSION,
            "headers": EXPECTED_HEADERS,
            "scoreColumns": {
                "sourceRowId": "1141208:A",
                "lexicalText": "B",
                "writtenPerMillion": "D",
                "spokenPerMillion": "G",
            },
            "ignoredForScore": ["J", "L"],
        },
        "catalog": {
            "entryCount": len(catalog_items),
            "normalizedTextCount": len(target_texts),
            "identityRule": "NFC(trim(text)) exact match; exactly one catalog identity required",
        },
        "rows": rows,
        "diagnostics": {
            "sourceRowCount": source_row_count,
            "catalogScopedSourceRowCount": len(rows),
            "unmatchedCatalogTexts": unmatched_catalog_texts,
            "ambiguousCatalogTexts": ambiguous_catalog_texts,
            "omittedNonCatalogSourceRowCount": source_row_count - len(rows),
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--workbook", required=True, type=Path)
    parser.add_argument("--catalog", default=Path("data/source/words.sample.csv"), type=Path)
    parser.add_argument(
        "--output",
        default=Path("data/commonness/naer-1141208-active-catalog-rows.json"),
        type=Path,
    )
    arguments = parser.parse_args()
    payload = extract_catalog_rows(arguments.workbook, arguments.catalog)
    arguments.output.parent.mkdir(parents=True, exist_ok=True)
    arguments.output.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    diagnostics = payload["diagnostics"]
    print(
        "wrote "
        f"{diagnostics['catalogScopedSourceRowCount']} catalog-scoped source rows; "
        f"{len(diagnostics['unmatchedCatalogTexts'])} unmatched catalog texts; "
        f"{len(diagnostics['ambiguousCatalogTexts'])} ambiguous catalog texts"
    )


if __name__ == "__main__":
    main()

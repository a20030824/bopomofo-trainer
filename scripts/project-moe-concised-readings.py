#!/usr/bin/env python3
"""Project catalog-scoped Taiwan Mandarin readings from the MOE Concised Dictionary.

The official bulk archive remains local. This adapter verifies the pinned outer
ZIP and inner XLSX identities, reads only the source fields required for lexical
identity and Bopomofo, and emits a small candidate-scoped artifact. Definitions,
examples, audio, images, and the complete dictionary are never written.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
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

SOURCE_ID = "moe:concised-dictionary"
SOURCE_VERSION = "2014_20260626"
ADAPTER_VERSION = "moe-concised-reading-adapter-v1"
LANDING_URL = (
    "https://language.moe.gov.tw/001/Upload/Files/site_content/"
    "M0001/respub/dict_concised_download.html"
)
DOWNLOAD_URL = (
    "https://language.moe.gov.tw/001/Upload/Files/site_content/"
    "M0001/respub/download/dict_concised_2014_20260626.zip"
)
EXPECTED_ARCHIVE_SHA256 = "fc83d27eb3fbf6fcfdb791e7d05ef60946b58ef8e8857ed165b612217b392806"
EXPECTED_MEMBER = "dict_concised_2014_20260626.xlsx"
EXPECTED_MEMBER_SIZE = 7_076_857
EXPECTED_MEMBER_SHA256 = "a9a4fd7259180113bfae2e94110eae87ac4dcf0bfcc91a6437c3ad4773ab7865"
EXPECTED_SHEET = "辭典匯出_1150626"
EXPECTED_DIMENSION = "A1:O45131"
EXPECTED_HEADERS = [
    "字詞名",
    "字詞號",
    "部首字",
    "總筆畫數",
    "部首外筆畫數",
    "多音排序",
    "注音一式",
    "變體類型 1:變 2:又音 3:語音 4:讀音",
    "變體注音",
    "漢語拼音",
    "變體漢語拼音",
    "相似詞",
    "相反詞",
    "釋義",
    "多音參見訊息",
]

TONE_MARKS = {"ˊ": 2, "ˇ": 3, "ˋ": 4}
BOPOMOFO_PATTERN = re.compile(r"^[\u3105-\u312f]+$")


def q(namespace: str, name: str) -> str:
    return f"{{{namespace}}}{name}"


def text_content(element: ET.Element | None) -> str:
    return "" if element is None else "".join(element.itertext())


def normalize_target(base: str, target: str) -> str:
    if target.startswith("/"):
        return target.lstrip("/")
    return posixpath.normpath(posixpath.join(base, target))


def normalize_lookup_text(value: str) -> str:
    return unicodedata.normalize("NFC", value.strip())


def excel_column_index(reference: str) -> int:
    match = re.match(r"([A-Z]+)", reference.upper())
    if match is None:
        raise ValueError(f"invalid cell reference: {reference}")
    result = 0
    for character in match.group(1):
        result = result * 26 + ord(character) - ord("A") + 1
    return result


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


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


@dataclass(frozen=True)
class SourceReading:
    physical_row_number: int
    source_headword: str
    source_entry_id: str
    multi_reading_order: int
    source_bopomofo: str
    multi_reading_reference: str | None


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


def required_string(cells: dict[int, Cell], column: int, label: str) -> str:
    value = cells[column].value if column in cells else None
    if not isinstance(value, str) or value == "":
        raise ValueError(f"{label} must contain source text")
    return value


def optional_string(cells: dict[int, Cell], column: int, label: str) -> str | None:
    value = cells[column].value if column in cells else None
    if value is None or value == "":
        return None
    if not isinstance(value, str):
        raise ValueError(f"{label} must contain text or be blank")
    return value


def nonnegative_integer(cells: dict[int, Cell], column: int, label: str) -> int:
    value = cells[column].value if column in cells else None
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{label} must be a non-negative integer")
    number = float(value)
    if not number.is_integer() or number < 0:
        raise ValueError(f"{label} must be a non-negative integer")
    return int(number)


def trainer_syllable(source_syllable: str) -> str:
    if source_syllable.startswith("˙"):
        tone = 5
        body = source_syllable[1:]
    else:
        marks = [mark for mark in TONE_MARKS if mark in source_syllable]
        if len(marks) > 1:
            raise ValueError(f"Bopomofo syllable has multiple tone marks: {source_syllable!r}")
        if "˙" in source_syllable:
            raise ValueError(f"neutral-tone mark must prefix the syllable: {source_syllable!r}")
        tone = 1 if not marks else TONE_MARKS[marks[0]]
        body = source_syllable if not marks else source_syllable.replace(marks[0], "")
    if not body or BOPOMOFO_PATTERN.fullmatch(body) is None:
        raise ValueError(f"unsupported Bopomofo syllable: {source_syllable!r}")
    return f"{body}{tone}"


def trainer_reading(source_bopomofo: str) -> str:
    syllables = re.split(r"\s+", source_bopomofo.strip())
    if not syllables or any(not syllable for syllable in syllables):
        raise ValueError("source Bopomofo must contain at least one syllable")
    return " ".join(trainer_syllable(syllable) for syllable in syllables)


def candidate_texts(path: Path) -> tuple[list[str], dict[str, int]]:
    normalized_texts: list[str] = []
    counts: dict[str, int] = {}
    with path.open("r", encoding="utf-8-sig", newline="") as source:
        reader = csv.DictReader(source)
        if reader.fieldnames is None or "text" not in reader.fieldnames:
            raise ValueError("candidate CSV must contain a text column")
        for row_number, row in enumerate(reader, start=2):
            if (row.get("status") or "") == "excluded":
                continue
            raw_text = row.get("text") or ""
            text = normalize_lookup_text(raw_text)
            if not text:
                raise ValueError(f"candidate row {row_number} is missing text")
            normalized_texts.append(text)
            counts[text] = counts.get(text, 0) + 1
    return normalized_texts, counts


def read_source_rows(
    archive_path: Path,
    target_texts: set[str],
) -> tuple[str, dict[str, list[SourceReading]], int, int]:
    checksum = sha256_file(archive_path)
    if checksum != EXPECTED_ARCHIVE_SHA256:
        raise ValueError(f"MOE Concised archive checksum mismatch: {checksum}")

    with zipfile.ZipFile(archive_path) as outer_archive:
        member_names = sorted(info.filename for info in outer_archive.infolist() if not info.is_dir())
        if member_names != [EXPECTED_MEMBER]:
            raise ValueError(f"MOE Concised archive members mismatch: {member_names!r}")
        member_info = outer_archive.getinfo(EXPECTED_MEMBER)
        if member_info.file_size != EXPECTED_MEMBER_SIZE:
            raise ValueError(f"MOE Concised workbook size mismatch: {member_info.file_size}")
        workbook_bytes = outer_archive.read(EXPECTED_MEMBER)

    member_checksum = sha256_bytes(workbook_bytes)
    if member_checksum != EXPECTED_MEMBER_SHA256:
        raise ValueError(f"MOE Concised workbook checksum mismatch: {member_checksum}")

    matched: dict[str, list[SourceReading]] = {}
    source_row_count = 0
    candidate_scoped_source_row_count = 0
    with zipfile.ZipFile(BytesIO(workbook_bytes)) as workbook_archive:
        shared_strings = read_shared_strings(workbook_archive)
        sheet_name, sheet_path = workbook_sheet(workbook_archive)
        if sheet_name != EXPECTED_SHEET:
            raise ValueError(f"MOE Concised workbook sheet mismatch: {sheet_name!r}")

        sheet_bytes = workbook_archive.read(sheet_path)
        sheet_root = ET.fromstring(sheet_bytes)
        dimension = sheet_root.find(q(MAIN, "dimension"))
        dimension_reference = dimension.attrib.get("ref") if dimension is not None else None
        if dimension_reference != EXPECTED_DIMENSION:
            raise ValueError(f"MOE Concised workbook dimension mismatch: {dimension_reference!r}")

        rows = iter_rows(sheet_bytes, shared_strings)
        try:
            header_row_number, header_cells = next(rows)
        except StopIteration as error:
            raise ValueError("MOE Concised workbook has no header row") from error
        headers = [header_cells[index].value if index in header_cells else None for index in range(1, 16)]
        if header_row_number != 1 or headers != EXPECTED_HEADERS:
            raise ValueError(f"MOE Concised workbook headers mismatch: {headers!r}")

        for physical_row_number, cells in rows:
            source_row_count += 1
            source_headword = required_string(cells, 1, f"A{physical_row_number}")
            lookup_text = normalize_lookup_text(source_headword)
            if lookup_text not in target_texts:
                continue
            candidate_scoped_source_row_count += 1
            row = SourceReading(
                physical_row_number=physical_row_number,
                source_headword=source_headword,
                source_entry_id=required_string(cells, 2, f"B{physical_row_number}"),
                multi_reading_order=nonnegative_integer(cells, 6, f"F{physical_row_number}"),
                source_bopomofo=required_string(cells, 7, f"G{physical_row_number}"),
                multi_reading_reference=optional_string(cells, 15, f"O{physical_row_number}"),
            )
            matched.setdefault(lookup_text, []).append(row)

    for rows_for_text in matched.values():
        rows_for_text.sort(
            key=lambda item: (
                item.multi_reading_order,
                item.source_entry_id,
                item.physical_row_number,
            )
        )
    return checksum, matched, source_row_count, candidate_scoped_source_row_count


def project_candidate_readings(archive_path: Path, candidate_path: Path) -> dict[str, Any]:
    candidate_items, candidate_counts = candidate_texts(candidate_path)
    target_texts = set(candidate_items)
    checksum, matched, source_row_count, scoped_source_row_count = read_source_rows(
        archive_path,
        target_texts,
    )

    accepted_rows: list[dict[str, Any]] = []
    unmatched: list[str] = []
    ambiguous_candidates = sorted(text for text, count in candidate_counts.items() if count > 1)
    duplicate_source_identities: list[str] = []
    multiple_readings: list[str] = []
    invalid_readings: list[dict[str, str]] = []

    for lookup_text in sorted(target_texts):
        if candidate_counts[lookup_text] > 1:
            continue
        source_rows = matched.get(lookup_text, [])
        if not source_rows:
            unmatched.append(lookup_text)
            continue
        if len(source_rows) > 1:
            distinct_readings = {row.source_bopomofo for row in source_rows}
            if len(distinct_readings) > 1:
                multiple_readings.append(lookup_text)
            else:
                duplicate_source_identities.append(lookup_text)
            continue

        source_row = source_rows[0]
        try:
            normalized_reading = trainer_reading(source_row.source_bopomofo)
        except ValueError as error:
            invalid_readings.append({"text": lookup_text, "reason": str(error)})
            continue
        accepted_rows.append(
            {
                "lookupText": lookup_text,
                "sourceHeadword": source_row.source_headword,
                "sourceEntryId": source_row.source_entry_id,
                "sourcePhysicalRow": source_row.physical_row_number,
                "multiReadingOrder": source_row.multi_reading_order,
                "sourceBopomofo": source_row.source_bopomofo,
                "trainerReading": normalized_reading,
                "multiReadingReference": source_row.multi_reading_reference,
            }
        )

    return {
        "adapterVersion": ADAPTER_VERSION,
        "source": {
            "sourceId": SOURCE_ID,
            "sourceVersion": SOURCE_VERSION,
            "landingUrl": LANDING_URL,
            "downloadUrl": DOWNLOAD_URL,
            "archiveChecksumSha256": checksum,
            "archiveMember": EXPECTED_MEMBER,
            "archiveMemberSize": EXPECTED_MEMBER_SIZE,
            "archiveMemberChecksumSha256": EXPECTED_MEMBER_SHA256,
            "sheetName": EXPECTED_SHEET,
            "dimension": EXPECTED_DIMENSION,
            "headers": EXPECTED_HEADERS,
            "selectedColumns": {
                "sourceHeadword": "A:字詞名",
                "sourceEntryId": "B:字詞號",
                "multiReadingOrder": "F:多音排序",
                "sourceBopomofo": "G:注音一式",
                "multiReadingReference": "O:多音參見訊息",
            },
            "license": "CC BY-ND 3.0 TW",
            "redistributionBoundary": (
                "official bulk archive remains local; committed outputs must be candidate-scoped "
                "and preserve exact source evidence"
            ),
        },
        "candidateSet": {
            "entryCount": len(candidate_items),
            "normalizedTextCount": len(target_texts),
            "identityRule": "NFC(trim(text)) exact headword lookup; exactly one candidate and source row required",
        },
        "rows": accepted_rows,
        "diagnostics": {
            "sourceRowCount": source_row_count,
            "candidateScopedSourceRowCount": scoped_source_row_count,
            "acceptedCandidateCount": len(accepted_rows),
            "unmatchedCandidateTexts": unmatched,
            "ambiguousCandidateTexts": ambiguous_candidates,
            "duplicateSourceIdentityTexts": duplicate_source_identities,
            "multipleReadingTexts": multiple_readings,
            "invalidReadings": invalid_readings,
            "omittedNonCandidateSourceRowCount": source_row_count - scoped_source_row_count,
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--archive", required=True, type=Path)
    parser.add_argument("--candidates", default=Path("data/source/words.sample.csv"), type=Path)
    parser.add_argument(
        "--output",
        default=Path("data/readings/moe-concised-2014_20260626-active-catalog.json"),
        type=Path,
    )
    arguments = parser.parse_args()
    payload = project_candidate_readings(arguments.archive, arguments.candidates)
    arguments.output.parent.mkdir(parents=True, exist_ok=True)
    arguments.output.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    diagnostics = payload["diagnostics"]
    print(
        "wrote "
        f"{diagnostics['acceptedCandidateCount']} accepted candidate readings; "
        f"{len(diagnostics['unmatchedCandidateTexts'])} unmatched; "
        f"{len(diagnostics['multipleReadingTexts'])} multiple-reading"
    )


if __name__ == "__main__":
    main()

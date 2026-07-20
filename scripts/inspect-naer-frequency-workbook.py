#!/usr/bin/env python3
"""Inspect an XLSX without retaining or publishing its lexical rows.

The source workbook is downloaded to a temporary directory, inspected through
its ZIP/XML representation, and deleted when the process exits. Outputs contain
only provenance, workbook structure, header labels, and aggregate statistics.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import posixpath
import re
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from typing import Any, Iterable, Iterator
from xml.etree import ElementTree as ET

MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
DOC_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PKG_REL = "http://schemas.openxmlformats.org/package/2006/relationships"
CORE = "http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
DC = "http://purl.org/dc/elements/1.1/"
DCTERMS = "http://purl.org/dc/terms/"
APP = "http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"


def q(namespace: str, name: str) -> str:
    return f"{{{namespace}}}{name}"


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def excel_column_index(reference: str) -> int:
    match = re.match(r"([A-Z]+)", reference.upper())
    if match is None:
        raise ValueError(f"invalid cell reference: {reference}")
    value = 0
    for character in match.group(1):
        value = value * 26 + ord(character) - ord("A") + 1
    return value


def excel_column_name(index: int) -> str:
    if index <= 0:
        raise ValueError("column index must be positive")
    result = ""
    while index:
        index, remainder = divmod(index - 1, 26)
        result = chr(ord("A") + remainder) + result
    return result


def normalize_target(base: str, target: str) -> str:
    if target.startswith("/"):
        return target.lstrip("/")
    return posixpath.normpath(posixpath.join(base, target))


def text_content(element: ET.Element | None) -> str:
    if element is None:
        return ""
    return "".join(element.itertext())


def parse_number(value: str) -> int | float | None:
    try:
        number = float(value)
    except ValueError:
        return None
    if not math.isfinite(number):
        return None
    return int(number) if number.is_integer() else number


def safe_header(value: Any) -> str:
    return "" if value is None else str(value).strip()


def download(url: str, destination: Path, attempts: int = 4) -> dict[str, Any]:
    error: Exception | None = None
    for attempt in range(1, attempts + 1):
        request = urllib.request.Request(
            url,
            headers={
                "User-Agent": "Mozilla/5.0 (compatible; bopomofo-trainer-source-inspection/1.0)",
                "Accept": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,*/*;q=0.8",
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=120) as response, destination.open("wb") as output:
                digest = hashlib.sha256()
                size = 0
                while True:
                    chunk = response.read(1024 * 1024)
                    if not chunk:
                        break
                    output.write(chunk)
                    digest.update(chunk)
                    size += len(chunk)
                disposition = response.headers.get("Content-Disposition")
                return {
                    "requestedUrl": url,
                    "resolvedUrl": response.geturl(),
                    "retrievedAt": utc_now(),
                    "byteSize": size,
                    "checksumSha256": digest.hexdigest(),
                    "contentType": response.headers.get_content_type(),
                    "contentDisposition": disposition,
                    "etag": response.headers.get("ETag"),
                    "lastModified": response.headers.get("Last-Modified"),
                }
        except (urllib.error.URLError, TimeoutError, OSError) as caught:
            error = caught
            if attempt < attempts:
                time.sleep(attempt * 2)
    raise RuntimeError(f"failed to download workbook after {attempts} attempts: {error}")


def read_shared_strings(archive: zipfile.ZipFile) -> list[str]:
    path = "xl/sharedStrings.xml"
    if path not in archive.namelist():
        return []
    root = ET.fromstring(archive.read(path))
    return [text_content(item) for item in root.findall(q(MAIN, "si"))]


def read_relationships(archive: zipfile.ZipFile, path: str, base: str) -> dict[str, dict[str, str]]:
    if path not in archive.namelist():
        return {}
    root = ET.fromstring(archive.read(path))
    result: dict[str, dict[str, str]] = {}
    for relationship in root.findall(q(PKG_REL, "Relationship")):
        identifier = relationship.attrib.get("Id")
        target = relationship.attrib.get("Target")
        if identifier is None or target is None:
            continue
        result[identifier] = {
            "target": normalize_target(base, target),
            "type": relationship.attrib.get("Type", ""),
            "targetMode": relationship.attrib.get("TargetMode", "Internal"),
        }
    return result


def workbook_metadata(archive: zipfile.ZipFile) -> dict[str, Any]:
    result: dict[str, Any] = {}
    if "docProps/core.xml" in archive.namelist():
        root = ET.fromstring(archive.read("docProps/core.xml"))
        result["core"] = {
            "title": text_content(root.find(q(DC, "title"))) or None,
            "subject": text_content(root.find(q(DC, "subject"))) or None,
            "creator": text_content(root.find(q(DC, "creator"))) or None,
            "lastModifiedBy": text_content(root.find(q(CORE, "lastModifiedBy"))) or None,
            "created": text_content(root.find(q(DCTERMS, "created"))) or None,
            "modified": text_content(root.find(q(DCTERMS, "modified"))) or None,
        }
    if "docProps/app.xml" in archive.namelist():
        root = ET.fromstring(archive.read("docProps/app.xml"))
        result["application"] = {
            "application": text_content(root.find(q(APP, "Application"))) or None,
            "appVersion": text_content(root.find(q(APP, "AppVersion"))) or None,
            "company": text_content(root.find(q(APP, "Company"))) or None,
        }
    return result


def workbook_structure(archive: zipfile.ZipFile) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    workbook_path = "xl/workbook.xml"
    root = ET.fromstring(archive.read(workbook_path))
    relationships = read_relationships(archive, "xl/_rels/workbook.xml.rels", "xl")
    sheets: list[dict[str, Any]] = []
    for sheet in root.find(q(MAIN, "sheets")) or []:
        relationship_id = sheet.attrib.get(q(DOC_REL, "id"), "")
        relationship = relationships.get(relationship_id, {})
        sheets.append(
            {
                "name": sheet.attrib.get("name", ""),
                "sheetId": sheet.attrib.get("sheetId"),
                "state": sheet.attrib.get("state", "visible"),
                "relationshipId": relationship_id,
                "path": relationship.get("target"),
            }
        )
    defined_names = []
    defined = root.find(q(MAIN, "definedNames"))
    if defined is not None:
        for item in defined.findall(q(MAIN, "definedName")):
            defined_names.append(
                {
                    "name": item.attrib.get("name"),
                    "localSheetId": item.attrib.get("localSheetId"),
                    "hidden": item.attrib.get("hidden") == "1",
                    "hasFormula": bool(text_content(item)),
                }
            )
    calc = root.find(q(MAIN, "calcPr"))
    properties = {
        "definedNames": defined_names,
        "calculation": dict(calc.attrib) if calc is not None else {},
    }
    return sheets, properties


def styles_summary(archive: zipfile.ZipFile) -> dict[str, Any]:
    path = "xl/styles.xml"
    if path not in archive.namelist():
        return {"present": False}
    root = ET.fromstring(archive.read(path))
    num_formats = root.find(q(MAIN, "numFmts"))
    cell_formats = root.find(q(MAIN, "cellXfs"))
    fonts = root.find(q(MAIN, "fonts"))
    fills = root.find(q(MAIN, "fills"))
    borders = root.find(q(MAIN, "borders"))
    return {
        "present": True,
        "customNumberFormatCount": len(num_formats or []),
        "cellFormatCount": len(cell_formats or []),
        "fontCount": len(fonts or []),
        "fillCount": len(fills or []),
        "borderCount": len(borders or []),
    }


@dataclass(frozen=True)
class Cell:
    column: int
    reference: str
    kind: str
    value: Any
    formula: bool
    style: int | None


def decode_cell(cell: ET.Element, shared_strings: list[str]) -> Cell:
    reference = cell.attrib.get("r", "")
    column = excel_column_index(reference)
    cell_type = cell.attrib.get("t", "n")
    style = int(cell.attrib["s"]) if cell.attrib.get("s", "").isdigit() else None
    formula = cell.find(q(MAIN, "f")) is not None
    value_element = cell.find(q(MAIN, "v"))
    raw = text_content(value_element)
    if cell_type == "s":
        try:
            value: Any = shared_strings[int(raw)]
        except (ValueError, IndexError):
            value = None
        kind = "shared-string"
    elif cell_type == "inlineStr":
        value = text_content(cell.find(q(MAIN, "is")))
        kind = "inline-string"
    elif cell_type == "b":
        value = raw == "1"
        kind = "boolean"
    elif cell_type == "e":
        value = raw or None
        kind = "error"
    elif cell_type == "str":
        value = raw
        kind = "formula-string" if formula else "string"
    else:
        value = parse_number(raw) if raw != "" else None
        kind = "formula-number" if formula else "number"
    return Cell(column, reference, kind, value, formula, style)


def iter_rows(sheet_bytes: bytes, shared_strings: list[str]) -> Iterator[tuple[int, bool, dict[int, Cell]]]:
    for _, element in ET.iterparse(BytesIO(sheet_bytes), events=("end",)):
        if element.tag != q(MAIN, "row"):
            continue
        row_number = int(element.attrib.get("r", "0") or 0)
        hidden = element.attrib.get("hidden") == "1"
        cells = {
            decoded.column: decoded
            for decoded in (decode_cell(cell, shared_strings) for cell in element.findall(q(MAIN, "c")))
        }
        yield row_number, hidden, cells
        element.clear()


def header_candidate(rows: Iterable[tuple[int, bool, dict[int, Cell]]]) -> tuple[int | None, dict[int, Cell]]:
    best_row: int | None = None
    best_cells: dict[int, Cell] = {}
    best_score = -1
    for row_number, _, cells in rows:
        if row_number > 30:
            break
        string_cells = [cell for cell in cells.values() if isinstance(cell.value, str) and cell.value.strip()]
        nonempty = [cell for cell in cells.values() if cell.value not in (None, "")]
        if len(string_cells) < 2:
            continue
        score = len(string_cells) * 10 + len(nonempty)
        if score > best_score:
            best_score = score
            best_row = row_number
            best_cells = cells
    return best_row, best_cells


def suggested_semantic(header: str) -> list[str]:
    compact = re.sub(r"\s+", "", header)
    suggestions = []
    if any(token in compact for token in ("詞語", "詞目", "詞形", "詞彙")):
        suggestions.append("lexical-text-candidate")
    if "口語" in compact and any(token in compact for token in ("頻", "次", "每百萬")):
        suggestions.append("spoken-frequency-candidate")
    if "書面" in compact and any(token in compact for token in ("頻", "次", "每百萬")):
        suggestions.append("written-frequency-candidate")
    if "詞頻" in compact or compact in {"頻率", "頻次"}:
        suggestions.append("general-frequency-candidate")
    if any(token in compact for token in ("排名", "序號", "順位")):
        suggestions.append("rank-or-row-identity-candidate")
    if any(token in compact for token in ("注音", "音讀", "讀音", "拼音")):
        suggestions.append("reading-candidate")
    if any(token in compact for token in ("詞類", "詞性")):
        suggestions.append("part-of-speech-candidate")
    if any(token in compact for token in ("等級", "級別")):
        suggestions.append("pedagogical-level-candidate")
    return suggestions


def inspect_sheet(
    archive: zipfile.ZipFile,
    sheet: dict[str, Any],
    shared_strings: list[str],
) -> dict[str, Any]:
    path = sheet.get("path")
    if not isinstance(path, str) or path not in archive.namelist():
        return {**sheet, "error": "worksheet relationship target is missing"}
    sheet_bytes = archive.read(path)
    root = ET.fromstring(sheet_bytes)
    dimension = root.find(q(MAIN, "dimension"))
    merge_cells = root.find(q(MAIN, "mergeCells"))
    merged_ranges = [item.attrib.get("ref") for item in (merge_cells or []) if item.attrib.get("ref")]
    hyperlinks = root.find(q(MAIN, "hyperlinks"))
    columns = root.find(q(MAIN, "cols"))
    hidden_column_ranges = []
    for item in columns or []:
        if item.attrib.get("hidden") == "1":
            hidden_column_ranges.append(
                {"min": int(item.attrib.get("min", "0")), "max": int(item.attrib.get("max", "0"))}
            )

    header_row, header_cells = header_candidate(iter_rows(sheet_bytes, shared_strings))
    headers = {
        column: safe_header(cell.value)
        for column, cell in header_cells.items()
        if safe_header(cell.value)
    }
    max_header_column = max(headers, default=0)

    physical_rows = 0
    hidden_rows = 0
    blank_row_elements = 0
    nonempty_row_numbers: list[int] = []
    data_rows = 0
    duplicate_rows = 0
    seen_rows: set[str] = set()
    formula_count = 0
    cell_type_counts: Counter[str] = Counter()
    style_counts: Counter[int] = Counter()
    column_stats: dict[int, dict[str, Any]] = defaultdict(
        lambda: {
            "presentCount": 0,
            "numericCount": 0,
            "zeroCount": 0,
            "stringCount": 0,
            "booleanCount": 0,
            "errorCount": 0,
            "formulaCount": 0,
            "numericMinimum": None,
            "numericMaximum": None,
            "minimumStringLength": None,
            "maximumStringLength": None,
        }
    )
    max_column = 0
    min_row: int | None = None
    max_row = 0

    for row_number, hidden, cells in iter_rows(sheet_bytes, shared_strings):
        physical_rows += 1
        hidden_rows += int(hidden)
        min_row = row_number if min_row is None else min(min_row, row_number)
        max_row = max(max_row, row_number)
        max_column = max(max_column, max(cells, default=0))
        nonempty = {column: cell for column, cell in cells.items() if cell.value not in (None, "")}
        if not nonempty:
            blank_row_elements += 1
            continue
        nonempty_row_numbers.append(row_number)
        formula_count += sum(int(cell.formula) for cell in nonempty.values())
        for cell in nonempty.values():
            cell_type_counts[cell.kind] += 1
            if cell.style is not None:
                style_counts[cell.style] += 1
        if header_row is not None and row_number <= header_row:
            continue
        data_rows += 1
        digest_payload = [
            [column, cell.kind, cell.value]
            for column, cell in sorted(nonempty.items())
        ]
        digest = hashlib.sha256(
            json.dumps(digest_payload, ensure_ascii=False, separators=(",", ":"), default=str).encode("utf-8")
        ).hexdigest()
        if digest in seen_rows:
            duplicate_rows += 1
        else:
            seen_rows.add(digest)
        for column, cell in nonempty.items():
            stats = column_stats[column]
            stats["presentCount"] += 1
            stats["formulaCount"] += int(cell.formula)
            if isinstance(cell.value, bool):
                stats["booleanCount"] += 1
            elif isinstance(cell.value, (int, float)):
                stats["numericCount"] += 1
                stats["zeroCount"] += int(cell.value == 0)
                current_min = stats["numericMinimum"]
                current_max = stats["numericMaximum"]
                stats["numericMinimum"] = cell.value if current_min is None else min(current_min, cell.value)
                stats["numericMaximum"] = cell.value if current_max is None else max(current_max, cell.value)
            elif cell.kind == "error":
                stats["errorCount"] += 1
            else:
                stats["stringCount"] += 1
                length = len(str(cell.value))
                current_min = stats["minimumStringLength"]
                current_max = stats["maximumStringLength"]
                stats["minimumStringLength"] = length if current_min is None else min(current_min, length)
                stats["maximumStringLength"] = length if current_max is None else max(current_max, length)

    missing_row_numbers = 0
    if nonempty_row_numbers:
        expected = nonempty_row_numbers[-1] - nonempty_row_numbers[0] + 1
        missing_row_numbers = expected - len(set(nonempty_row_numbers))

    columns_report = []
    for column in range(1, max(max_column, max_header_column) + 1):
        stats = dict(column_stats[column])
        stats["blankCount"] = max(0, data_rows - stats["presentCount"])
        header = headers.get(column, "")
        columns_report.append(
            {
                "column": excel_column_name(column),
                "header": header or None,
                "headerSemanticsSuggested": suggested_semantic(header),
                **stats,
            }
        )

    tables = []
    worksheet_rels_path = posixpath.join(
        posixpath.dirname(path),
        "_rels",
        posixpath.basename(path) + ".rels",
    )
    worksheet_rels = read_relationships(archive, worksheet_rels_path, posixpath.dirname(path))
    table_parts = root.find(q(MAIN, "tableParts"))
    for part in table_parts or []:
        relationship_id = part.attrib.get(q(DOC_REL, "id"), "")
        target = worksheet_rels.get(relationship_id, {}).get("target")
        if isinstance(target, str) and target in archive.namelist():
            table_root = ET.fromstring(archive.read(target))
            tables.append(
                {
                    "name": table_root.attrib.get("name"),
                    "displayName": table_root.attrib.get("displayName"),
                    "reference": table_root.attrib.get("ref"),
                    "columnCount": len(table_root.find(q(MAIN, "tableColumns")) or []),
                }
            )

    return {
        **sheet,
        "dimensionReference": dimension.attrib.get("ref") if dimension is not None else None,
        "physicalRowElementCount": physical_rows,
        "dataRowCountAfterDetectedHeader": data_rows,
        "blankRowElementCount": blank_row_elements,
        "missingRowNumberCountInsideUsedSpan": missing_row_numbers,
        "minimumRowNumber": min_row,
        "maximumRowNumber": max_row,
        "maximumColumnNumber": max_column,
        "maximumColumn": excel_column_name(max_column) if max_column else None,
        "hiddenRowCount": hidden_rows,
        "hiddenColumnRanges": hidden_column_ranges,
        "detectedHeaderRow": header_row,
        "headers": [
            {"column": excel_column_name(column), "label": label}
            for column, label in sorted(headers.items())
        ],
        "formulaCount": formula_count,
        "mergedRangeCount": len(merged_ranges),
        "mergedRanges": merged_ranges,
        "hyperlinkCount": len(hyperlinks or []),
        "tableCount": len(tables),
        "tables": tables,
        "duplicateDataRowCount": duplicate_rows,
        "cellTypeCounts": dict(sorted(cell_type_counts.items())),
        "usedStyleIndexes": [
            {"styleIndex": style, "cellCount": count}
            for style, count in sorted(style_counts.items())
        ],
        "columns": columns_report,
    }


def model_sufficiency(sheets: list[dict[str, Any]]) -> dict[str, Any]:
    suggestions = Counter(
        suggestion
        for sheet in sheets
        for column in sheet.get("columns", [])
        for suggestion in column.get("headerSemanticsSuggested", [])
    )
    has_identity = suggestions["lexical-text-candidate"] > 0
    has_spoken = suggestions["spoken-frequency-candidate"] > 0
    has_written = suggestions["written-frequency-candidate"] > 0
    has_general = suggestions["general-frequency-candidate"] > 0
    return {
        "lexicalIdentityHeaderCandidatePresent": has_identity,
        "spokenFrequencyHeaderCandidatePresent": has_spoken,
        "writtenFrequencyHeaderCandidatePresent": has_written,
        "generalFrequencyHeaderCandidatePresent": has_general,
        "sufficientForSpokenWrittenProductBase": has_identity and has_spoken and has_written,
        "sufficientForSingleGeneralFrequencyBase": has_identity and has_general,
        "decision": (
            "schema appears sufficient for a spoken/written base"
            if has_identity and has_spoken and has_written
            else "schema appears sufficient only for a single general-frequency base"
            if has_identity and has_general
            else "schema is not sufficient for a product commonness base without another source"
        ),
        "caution": "Header matching is a structural suggestion only; semantic adoption requires manual review.",
    }


def render_markdown(report: dict[str, Any]) -> str:
    source = report["source"]
    workbook = report["workbook"]
    lines = [
        "# NAER general-frequency workbook inspection",
        "",
        "> Structural inspection only. The official workbook and lexical rows are not committed or published.",
        "",
        "## Source provenance",
        "",
        f"- Requested URL: `{source['requestedUrl']}`",
        f"- Resolved URL: `{source['resolvedUrl']}`",
        f"- Retrieved at: `{source['retrievedAt']}`",
        f"- Observed filename: `{source['observedFilename']}`",
        f"- Bytes: `{source['byteSize']}`",
        f"- SHA-256: `{source['checksumSha256']}`",
        f"- Content type: `{source['contentType']}`",
        "- Redistribution status: `local-only-pending-license-review`",
        "",
        "## Workbook",
        "",
        f"- ZIP member count: `{workbook['zipMemberCount']}`",
        f"- Shared string count: `{workbook['sharedStringCount']}`",
        f"- Sheet count: `{len(report['sheets'])}`",
        f"- Defined-name count: `{len(workbook['properties']['definedNames'])}`",
        "",
    ]
    for sheet in report["sheets"]:
        lines.extend(
            [
                f"## Sheet: {sheet.get('name') or '(unnamed)'}",
                "",
                f"- State: `{sheet.get('state')}`",
                f"- Path: `{sheet.get('path')}`",
                f"- Dimension: `{sheet.get('dimensionReference')}`",
                f"- Detected header row: `{sheet.get('detectedHeaderRow')}`",
                f"- Physical row elements: `{sheet.get('physicalRowElementCount')}`",
                f"- Data rows after header: `{sheet.get('dataRowCountAfterDetectedHeader')}`",
                f"- Duplicate data rows: `{sheet.get('duplicateDataRowCount')}`",
                f"- Blank row elements: `{sheet.get('blankRowElementCount')}`",
                f"- Hidden rows: `{sheet.get('hiddenRowCount')}`",
                f"- Formula count: `{sheet.get('formulaCount')}`",
                f"- Merged ranges: `{sheet.get('mergedRangeCount')}`",
                f"- Tables: `{sheet.get('tableCount')}`",
                "",
                "### Headers",
                "",
            ]
        )
        for header in sheet.get("headers", []):
            lines.append(f"- `{header['column']}`: `{header['label']}`")
        lines.extend(
            [
                "",
                "### Aggregate column profile",
                "",
                "| Col | Header | Present | Blank | Numeric | Zero | String | Formula | Min | Max | Suggested semantics |",
                "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
            ]
        )
        for column in sheet.get("columns", []):
            semantics = ", ".join(column["headerSemanticsSuggested"]) or "—"
            lines.append(
                "| {column} | {header} | {presentCount} | {blankCount} | {numericCount} | "
                "{zeroCount} | {stringCount} | {formulaCount} | {numericMinimum} | "
                "{numericMaximum} | {semantics} |".format(
                    column=column["column"],
                    header=(column["header"] or "—").replace("|", "\\|"),
                    semantics=semantics,
                    **column,
                )
            )
        lines.append("")
    sufficiency = report["productModelSufficiency"]
    lines.extend(
        [
            "## First-product commonness gate",
            "",
            f"- Decision: **{sufficiency['decision']}**",
            f"- Lexical identity candidate: `{sufficiency['lexicalIdentityHeaderCandidatePresent']}`",
            f"- Spoken frequency candidate: `{sufficiency['spokenFrequencyHeaderCandidatePresent']}`",
            f"- Written frequency candidate: `{sufficiency['writtenFrequencyHeaderCandidatePresent']}`",
            f"- General frequency candidate: `{sufficiency['generalFrequencyHeaderCandidatePresent']}`",
            "- This is header-based structural evidence only. Exact source semantics must be reviewed before an adapter is implemented.",
            "",
            "## Explicitly not included",
            "",
            "- Official workbook bytes",
            "- Source lexical rows",
            "- Example frequency values tied to words",
            "- Automatic variant or heteronym decisions",
            "- License or redistribution permission claims",
            "",
        ]
    )
    return "\n".join(lines)


def observed_filename(source: dict[str, Any]) -> str:
    disposition = source.get("contentDisposition")
    if isinstance(disposition, str):
        match = re.search(r"filename\*=UTF-8''([^;]+)", disposition, flags=re.IGNORECASE)
        if match:
            return urllib.parse.unquote(match.group(1))
        match = re.search(r'filename="?([^";]+)', disposition, flags=re.IGNORECASE)
        if match:
            return match.group(1)
    return Path(urllib.parse.urlparse(source["resolvedUrl"]).path).name


def inspect(source_path: Path, source: dict[str, Any]) -> dict[str, Any]:
    if source_path.read_bytes()[:4] != b"PK\x03\x04":
        raise RuntimeError("download is not an XLSX/ZIP file")
    with zipfile.ZipFile(source_path) as archive:
        bad_member = archive.testzip()
        if bad_member is not None:
            raise RuntimeError(f"corrupt ZIP member: {bad_member}")
        shared_strings = read_shared_strings(archive)
        sheet_declarations, properties = workbook_structure(archive)
        sheets = [inspect_sheet(archive, sheet, shared_strings) for sheet in sheet_declarations]
        return {
            "inspectionVersion": "naer-workbook-structure-v1",
            "generatedAt": utc_now(),
            "source": {
                **source,
                "observedFilename": observed_filename(source),
                "redistributionStatus": "local-only-pending-license-review",
            },
            "workbook": {
                "zipMemberCount": len(archive.namelist()),
                "sharedStringCount": len(shared_strings),
                "metadata": workbook_metadata(archive),
                "styles": styles_summary(archive),
                "properties": properties,
            },
            "sheets": sheets,
            "productModelSufficiency": model_sufficiency(sheets),
            "privacyBoundary": {
                "sourceWorkbookRetained": False,
                "lexicalRowsEmitted": False,
                "headerLabelsEmitted": True,
                "aggregateStatisticsOnly": True,
            },
        }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", required=True)
    parser.add_argument("--output-dir", required=True, type=Path)
    arguments = parser.parse_args()
    arguments.output_dir.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="naer-workbook-") as temporary:
        source_path = Path(temporary) / "source.xlsx"
        source = download(arguments.url, source_path)
        report = inspect(source_path, source)

    json_path = arguments.output_dir / "naer-frequency-workbook-inspection.json"
    markdown_path = arguments.output_dir / "naer-frequency-workbook-inspection.md"
    manifest_path = arguments.output_dir / "naer-frequency-workbook-manifest.json"
    json_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    markdown_path.write_text(render_markdown(report), encoding="utf-8")
    manifest_path.write_text(
        json.dumps(
            {
                "sourceId": "naer:coct-general-frequency",
                "landingUrl": "https://coct.naer.edu.tw/page.jsp?ID=41",
                "downloadUrl": report["source"]["resolvedUrl"],
                "observedFilename": report["source"]["observedFilename"],
                "retrievedAt": report["source"]["retrievedAt"],
                "byteSize": report["source"]["byteSize"],
                "checksumSha256": report["source"]["checksumSha256"],
                "mediaType": report["source"]["contentType"],
                "redistributionStatus": "local-only-pending-license-review",
                "inspectionStatus": "structural-inspection-complete",
                "inspectionVersion": report["inspectionVersion"],
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    if any(arguments.output_dir.glob("*.xlsx")):
        raise RuntimeError("inspection output must not contain source workbook bytes")
    print(markdown_path.read_text(encoding="utf-8"))


if __name__ == "__main__":
    main()

from __future__ import annotations

import csv
import hashlib
import importlib.util
import sys
import tempfile
import unittest
import zipfile
from io import BytesIO
from pathlib import Path
from types import ModuleType
from xml.sax.saxutils import escape


ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "project-moe-concised-readings.py"


def load_adapter() -> ModuleType:
    specification = importlib.util.spec_from_file_location(
        "project_moe_concised_readings",
        SCRIPT,
    )
    if specification is None or specification.loader is None:
        raise RuntimeError(f"cannot load adapter: {SCRIPT}")
    module = importlib.util.module_from_spec(specification)
    sys.modules[specification.name] = module
    specification.loader.exec_module(module)
    return module


def inline_cell(reference: str, value: str) -> str:
    return (
        f'<c r="{reference}" t="inlineStr"><is><t xml:space="preserve">'
        f"{escape(value)}</t></is></c>"
    )


def numeric_cell(reference: str, value: int | float) -> str:
    return f'<c r="{reference}"><v>{value}</v></c>'


def workbook_bytes(adapter: ModuleType, rows: list[dict[str, object]], headers: list[str]) -> bytes:
    header_cells = "".join(
        inline_cell(f"{chr(64 + index)}1", header)
        for index, header in enumerate(headers, start=1)
    )
    row_xml = []
    for index, row in enumerate(rows, start=2):
        cells = [
            inline_cell(f"A{index}", str(row["headword"])),
            inline_cell(f"B{index}", str(row["entry_id"])),
            numeric_cell(f"F{index}", int(row.get("order", 0))),
            inline_cell(f"G{index}", str(row["bopomofo"])),
        ]
        reference = row.get("reference")
        if reference is not None:
            cells.append(inline_cell(f"O{index}", str(reference)))
        row_xml.append(f'<row r="{index}">{"".join(cells)}</row>')
    dimension = f"A1:O{len(rows) + 1}"
    worksheet = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        f'<dimension ref="{dimension}"/>'
        f'<sheetData><row r="1">{header_cells}</row>{"".join(row_xml)}</sheetData>'
        "</worksheet>"
    )
    workbook = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        f'<sheets><sheet name="{adapter.EXPECTED_SHEET}" sheetId="1" r:id="rId1"/></sheets>'
        "</workbook>"
    )
    relationships = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" '
        'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" '
        'Target="worksheets/sheet1.xml"/>'
        "</Relationships>"
    )
    destination = BytesIO()
    with zipfile.ZipFile(destination, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("xl/workbook.xml", workbook)
        archive.writestr("xl/_rels/workbook.xml.rels", relationships)
        archive.writestr("xl/worksheets/sheet1.xml", worksheet)
    return destination.getvalue()


def fixture_archive(
    path: Path,
    adapter: ModuleType,
    rows: list[dict[str, object]],
    headers: list[str] | None = None,
    member_name: str | None = None,
) -> bytes:
    content = workbook_bytes(adapter, rows, headers or list(adapter.EXPECTED_HEADERS))
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr(member_name or adapter.EXPECTED_MEMBER, content)
    return content


def fixture_candidates(path: Path, texts: list[str]) -> None:
    with path.open("w", encoding="utf-8", newline="") as destination:
        writer = csv.DictWriter(destination, fieldnames=["text", "status"])
        writer.writeheader()
        for text in texts:
            writer.writerow({"text": text, "status": "provisional"})


class ProjectMoeConcisedReadingsTest(unittest.TestCase):
    def setUp(self) -> None:
        self.adapter = load_adapter()
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.archive = self.root / "moe.zip"
        self.candidates = self.root / "candidates.csv"

    def pin_fixture(self, workbook: bytes, row_count: int) -> None:
        self.adapter.EXPECTED_ARCHIVE_SHA256 = hashlib.sha256(self.archive.read_bytes()).hexdigest()
        self.adapter.EXPECTED_MEMBER_SIZE = len(workbook)
        self.adapter.EXPECTED_MEMBER_SHA256 = hashlib.sha256(workbook).hexdigest()
        self.adapter.EXPECTED_DIMENSION = f"A1:O{row_count + 1}"

    def test_projects_unique_readings_and_preserves_source_evidence(self) -> None:
        rows = [
            {
                "headword": "八拜之交",
                "entry_id": "000100000",
                "bopomofo": "ㄅㄚ　ㄅㄞˋ　ㄓ　ㄐㄧㄠ",
            },
            {
                "headword": "媽媽",
                "entry_id": "1234",
                "bopomofo": "ㄇㄚ　˙ㄇㄚ",
            },
        ]
        workbook = fixture_archive(self.archive, self.adapter, rows)
        self.pin_fixture(workbook, len(rows))
        fixture_candidates(self.candidates, [" 八拜之交 ", "媽媽", "缺詞"])

        payload = self.adapter.project_candidate_readings(self.archive, self.candidates)

        self.assertEqual(
            payload["rows"],
            [
                {
                    "lookupText": "八拜之交",
                    "sourceHeadword": "八拜之交",
                    "sourceEntryId": "000100000",
                    "sourcePhysicalRow": 2,
                    "multiReadingOrder": 0,
                    "sourceBopomofo": "ㄅㄚ　ㄅㄞˋ　ㄓ　ㄐㄧㄠ",
                    "trainerReading": "ㄅㄚ1 ㄅㄞ4 ㄓ1 ㄐㄧㄠ1",
                    "multiReadingReference": None,
                },
                {
                    "lookupText": "媽媽",
                    "sourceHeadword": "媽媽",
                    "sourceEntryId": "1234",
                    "sourcePhysicalRow": 3,
                    "multiReadingOrder": 0,
                    "sourceBopomofo": "ㄇㄚ　˙ㄇㄚ",
                    "trainerReading": "ㄇㄚ1 ㄇㄚ5",
                    "multiReadingReference": None,
                },
            ],
        )
        self.assertEqual(payload["diagnostics"]["unmatchedCandidateTexts"], ["缺詞"])

    def test_excludes_duplicate_source_identity_and_multiple_readings(self) -> None:
        rows = [
            {"headword": "重複", "entry_id": "1", "bopomofo": "ㄔㄨㄥˊ　ㄈㄨˋ"},
            {"headword": "重複", "entry_id": "2", "bopomofo": "ㄔㄨㄥˊ　ㄈㄨˋ"},
            {"headword": "行", "entry_id": "3", "order": 1, "bopomofo": "ㄒㄧㄥˊ"},
            {"headword": "行", "entry_id": "4", "order": 2, "bopomofo": "ㄏㄤˊ"},
        ]
        workbook = fixture_archive(self.archive, self.adapter, rows)
        self.pin_fixture(workbook, len(rows))
        fixture_candidates(self.candidates, ["重複", "行"])

        payload = self.adapter.project_candidate_readings(self.archive, self.candidates)

        self.assertEqual(payload["rows"], [])
        self.assertEqual(payload["diagnostics"]["duplicateSourceIdentityTexts"], ["重複"])
        self.assertEqual(payload["diagnostics"]["multipleReadingTexts"], ["行"])

    def test_excludes_duplicate_candidate_identity(self) -> None:
        rows = [{"headword": "八", "entry_id": "0001", "bopomofo": "ㄅㄚ"}]
        workbook = fixture_archive(self.archive, self.adapter, rows)
        self.pin_fixture(workbook, len(rows))
        fixture_candidates(self.candidates, ["八", " 八 "])

        payload = self.adapter.project_candidate_readings(self.archive, self.candidates)

        self.assertEqual(payload["rows"], [])
        self.assertEqual(payload["diagnostics"]["ambiguousCandidateTexts"], ["八"])

    def test_rejects_archive_checksum_mismatch(self) -> None:
        rows = [{"headword": "八", "entry_id": "0001", "bopomofo": "ㄅㄚ"}]
        fixture_archive(self.archive, self.adapter, rows)
        fixture_candidates(self.candidates, ["八"])
        with self.assertRaisesRegex(ValueError, "archive checksum"):
            self.adapter.project_candidate_readings(self.archive, self.candidates)

    def test_rejects_exact_header_mismatch(self) -> None:
        rows = [{"headword": "八", "entry_id": "0001", "bopomofo": "ㄅㄚ"}]
        headers = list(self.adapter.EXPECTED_HEADERS)
        headers[6] = "注音"
        workbook = fixture_archive(self.archive, self.adapter, rows, headers=headers)
        self.pin_fixture(workbook, len(rows))
        fixture_candidates(self.candidates, ["八"])
        with self.assertRaisesRegex(ValueError, "headers"):
            self.adapter.project_candidate_readings(self.archive, self.candidates)

    def test_rejects_unexpected_archive_member(self) -> None:
        rows = [{"headword": "八", "entry_id": "0001", "bopomofo": "ㄅㄚ"}]
        fixture_archive(self.archive, self.adapter, rows, member_name="unexpected.xlsx")
        self.adapter.EXPECTED_ARCHIVE_SHA256 = hashlib.sha256(self.archive.read_bytes()).hexdigest()
        fixture_candidates(self.candidates, ["八"])
        with self.assertRaisesRegex(ValueError, "members"):
            self.adapter.project_candidate_readings(self.archive, self.candidates)


if __name__ == "__main__":
    unittest.main()

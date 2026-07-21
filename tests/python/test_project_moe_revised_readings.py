from __future__ import annotations

import csv
import hashlib
import importlib.util
import json
import sys
import tempfile
import unittest
import zipfile
from io import BytesIO
from pathlib import Path
from types import ModuleType
from xml.sax.saxutils import escape

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "project-moe-revised-readings.py"


def load_adapter() -> ModuleType:
    specification = importlib.util.spec_from_file_location("project_moe_revised_readings", SCRIPT)
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
            inline_cell(f"D{index}", str(row["entry_id"])),
            numeric_cell(f"H{index}", int(row.get("order", 0))),
            inline_cell(f"I{index}", str(row["bopomofo"])),
        ]
        reference = row.get("reference")
        if reference is not None:
            cells.append(inline_cell(f"Q{index}", str(reference)))
        row_xml.append(f'<row r="{index}">{"".join(cells)}</row>')
    worksheet = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        f'<dimension ref="A1:R{len(rows) + 1}"/>'
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
    extra_member: bool = False,
) -> tuple[bytes, bytes]:
    main = workbook_bytes(adapter, rows, headers or list(adapter.EXPECTED_HEADERS))
    guide = b"field-guide-fixture"
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr(adapter.EXPECTED_MAIN_MEMBER, main)
        archive.writestr(adapter.EXPECTED_FIELD_GUIDE_MEMBER, guide)
        if extra_member:
            archive.writestr("unexpected.txt", "unexpected")
    return main, guide


def fixture_candidates(path: Path, texts: list[str]) -> None:
    with path.open("w", encoding="utf-8", newline="") as destination:
        writer = csv.DictWriter(destination, fieldnames=["text", "status"])
        writer.writeheader()
        for text in texts:
            writer.writerow({"text": text, "status": "provisional"})


def fixture_concised(
    path: Path,
    accepted: list[str],
    unmatched: list[str] | None = None,
    multiple: list[str] | None = None,
    duplicate_source: list[str] | None = None,
    invalid: list[str] | None = None,
    entry_count: int | None = None,
) -> None:
    all_texts = accepted + (unmatched or []) + (multiple or []) + (duplicate_source or []) + (invalid or [])
    payload = {
        "adapterVersion": "moe-concised-reading-adapter-v1",
        "source": {"sourceVersion": "2014_20260626"},
        "candidateSet": {
            "entryCount": len(all_texts) if entry_count is None else entry_count,
            "normalizedTextCount": len(set(all_texts)),
        },
        "rows": [{"lookupText": text} for text in accepted],
        "diagnostics": {
            "unmatchedCandidateTexts": unmatched or [],
            "ambiguousCandidateTexts": [],
            "duplicateSourceIdentityTexts": duplicate_source or [],
            "multipleReadingTexts": multiple or [],
            "invalidReadings": [{"text": text, "reason": "fixture"} for text in (invalid or [])],
        },
    }
    path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")


class ProjectMoeRevisedReadingsTest(unittest.TestCase):
    def setUp(self) -> None:
        self.adapter = load_adapter()
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.archive = self.root / "revised.zip"
        self.candidates = self.root / "candidates.csv"
        self.concised = self.root / "concised.json"

    def pin_fixture(self, main: bytes, guide: bytes, row_count: int) -> None:
        self.adapter.EXPECTED_ARCHIVE_SHA256 = hashlib.sha256(self.archive.read_bytes()).hexdigest()
        self.adapter.EXPECTED_MAIN_MEMBER_SIZE = len(main)
        self.adapter.EXPECTED_MAIN_MEMBER_SHA256 = hashlib.sha256(main).hexdigest()
        self.adapter.EXPECTED_FIELD_GUIDE_SIZE = len(guide)
        self.adapter.EXPECTED_FIELD_GUIDE_SHA256 = hashlib.sha256(guide).hexdigest()
        self.adapter.EXPECTED_DIMENSION = f"A1:R{row_count + 1}"

    def test_projects_only_concised_unresolved_candidates(self) -> None:
        rows = [
            {"headword": "已解", "entry_id": "1", "bopomofo": "ㄧˇ　ㄐㄧㄝˇ"},
            {"headword": "缺詞", "entry_id": "2", "bopomofo": "ㄑㄩㄝ　ㄘˊ"},
            {"headword": "多音", "entry_id": "3", "bopomofo": "ㄉㄨㄛ　ㄧㄣ"},
        ]
        main, guide = fixture_archive(self.archive, self.adapter, rows)
        self.pin_fixture(main, guide, len(rows))
        fixture_candidates(self.candidates, ["已解", "缺詞", "多音"])
        fixture_concised(self.concised, ["已解"], unmatched=["缺詞"], multiple=["多音"])

        payload = self.adapter.project_revised_fallback(self.archive, self.candidates, self.concised)

        self.assertEqual([row["lookupText"] for row in payload["rows"]], ["多音", "缺詞"])
        self.assertEqual(payload["fallbackBasis"]["concisedAcceptedCandidateCount"], 1)
        self.assertEqual(payload["fallbackBasis"]["fallbackCandidateTexts"], ["多音", "缺詞"])
        self.assertNotIn("已解", [row["lookupText"] for row in payload["rows"]])
        self.assertTrue(all(row["fallbackStatus"] == "provisional" for row in payload["rows"]))

    def test_excludes_duplicate_source_identity_and_multiple_readings(self) -> None:
        rows = [
            {"headword": "重複", "entry_id": "1", "bopomofo": "ㄔㄨㄥˊ　ㄈㄨˋ"},
            {"headword": "重複", "entry_id": "2", "bopomofo": "ㄔㄨㄥˊ　ㄈㄨˋ"},
            {"headword": "行", "entry_id": "3", "order": 1, "bopomofo": "ㄒㄧㄥˊ"},
            {"headword": "行", "entry_id": "4", "order": 2, "bopomofo": "ㄏㄤˊ"},
        ]
        main, guide = fixture_archive(self.archive, self.adapter, rows)
        self.pin_fixture(main, guide, len(rows))
        fixture_candidates(self.candidates, ["重複", "行"])
        fixture_concised(self.concised, [], unmatched=["重複", "行"])

        payload = self.adapter.project_revised_fallback(self.archive, self.candidates, self.concised)

        self.assertEqual(payload["rows"], [])
        self.assertEqual(payload["diagnostics"]["duplicateSourceIdentityTexts"], ["重複"])
        self.assertEqual(payload["diagnostics"]["multipleReadingTexts"], ["行"])

    def test_rejects_concised_accepted_fallback_overlap(self) -> None:
        main, guide = fixture_archive(
            self.archive,
            self.adapter,
            [{"headword": "重疊", "entry_id": "1", "bopomofo": "ㄔㄨㄥˊ　ㄉㄧㄝˊ"}],
        )
        self.pin_fixture(main, guide, 1)
        fixture_candidates(self.candidates, ["重疊"])
        payload = {
            "adapterVersion": "moe-concised-reading-adapter-v1",
            "source": {"sourceVersion": "2014_20260626"},
            "candidateSet": {"entryCount": 1, "normalizedTextCount": 1},
            "rows": [{"lookupText": "重疊"}],
            "diagnostics": {
                "unmatchedCandidateTexts": ["重疊"],
                "ambiguousCandidateTexts": [],
                "duplicateSourceIdentityTexts": [],
                "multipleReadingTexts": [],
                "invalidReadings": [],
            },
        }
        self.concised.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "overlap"):
            self.adapter.project_revised_fallback(self.archive, self.candidates, self.concised)

    def test_rejects_archive_checksum_mismatch(self) -> None:
        fixture_archive(
            self.archive,
            self.adapter,
            [{"headword": "八", "entry_id": "1", "bopomofo": "ㄅㄚ"}],
        )
        fixture_candidates(self.candidates, ["八"])
        fixture_concised(self.concised, [], unmatched=["八"])
        with self.assertRaisesRegex(ValueError, "archive checksum"):
            self.adapter.project_revised_fallback(self.archive, self.candidates, self.concised)

    def test_rejects_exact_header_mismatch(self) -> None:
        headers = list(self.adapter.EXPECTED_HEADERS)
        headers[8] = "注音"
        main, guide = fixture_archive(
            self.archive,
            self.adapter,
            [{"headword": "八", "entry_id": "1", "bopomofo": "ㄅㄚ"}],
            headers=headers,
        )
        self.pin_fixture(main, guide, 1)
        fixture_candidates(self.candidates, ["八"])
        fixture_concised(self.concised, [], unmatched=["八"])
        with self.assertRaisesRegex(ValueError, "headers"):
            self.adapter.project_revised_fallback(self.archive, self.candidates, self.concised)

    def test_rejects_unexpected_archive_member(self) -> None:
        main, guide = fixture_archive(
            self.archive,
            self.adapter,
            [{"headword": "八", "entry_id": "1", "bopomofo": "ㄅㄚ"}],
            extra_member=True,
        )
        self.adapter.EXPECTED_ARCHIVE_SHA256 = hashlib.sha256(self.archive.read_bytes()).hexdigest()
        self.adapter.EXPECTED_MAIN_MEMBER_SIZE = len(main)
        self.adapter.EXPECTED_MAIN_MEMBER_SHA256 = hashlib.sha256(main).hexdigest()
        self.adapter.EXPECTED_FIELD_GUIDE_SIZE = len(guide)
        self.adapter.EXPECTED_FIELD_GUIDE_SHA256 = hashlib.sha256(guide).hexdigest()
        fixture_candidates(self.candidates, ["八"])
        fixture_concised(self.concised, [], unmatched=["八"])
        with self.assertRaisesRegex(ValueError, "members"):
            self.adapter.project_revised_fallback(self.archive, self.candidates, self.concised)


if __name__ == "__main__":
    unittest.main()

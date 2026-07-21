from __future__ import annotations

import csv
import hashlib
import importlib.util
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path
from types import ModuleType
from xml.sax.saxutils import escape


ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "project-naer-commonness.py"


def load_adapter() -> ModuleType:
    specification = importlib.util.spec_from_file_location(
        "project_naer_commonness",
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


def fixture_workbook(path: Path, headers: list[str]) -> None:
    header_cells = "".join(
        inline_cell(f"{chr(64 + index)}1", header)
        for index, header in enumerate(headers, start=1)
    )
    data_cells = "".join(
        [
            numeric_cell("A2", 7),
            inline_cell("B2", " 零 "),
            numeric_cell("D2", 0),
        ]
    )
    worksheet = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        '<dimension ref="A1:L163702"/>'
        f'<sheetData><row r="1">{header_cells}</row><row r="2">{data_cells}</row></sheetData>'
        "</worksheet>"
    )
    workbook = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        '<sheets><sheet name="通用詞頻表" sheetId="1" r:id="rId1"/></sheets>'
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
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("xl/workbook.xml", workbook)
        archive.writestr("xl/_rels/workbook.xml.rels", relationships)
        archive.writestr("xl/worksheets/sheet1.xml", worksheet)


def fixture_catalog(path: Path) -> None:
    with path.open("w", encoding="utf-8", newline="") as destination:
        writer = csv.DictWriter(
            destination,
            fieldnames=[
                "text",
                "reading",
                "frequency_band",
                "tags",
                "status",
                "provenance_ids",
            ],
        )
        writer.writeheader()
        writer.writerow(
            {
                "text": "零",
                "reading": "ㄌㄧㄥ2",
                "frequency_band": "1",
                "tags": "fixture",
                "status": "provisional",
                "provenance_ids": "fixture",
            }
        )


class ProjectNaerCommonnessTest(unittest.TestCase):
    def setUp(self) -> None:
        self.adapter = load_adapter()
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.workbook = self.root / "fixture.xlsx"
        self.catalog = self.root / "catalog.csv"
        fixture_catalog(self.catalog)

    def pin_fixture_checksum(self) -> None:
        checksum = hashlib.sha256(self.workbook.read_bytes()).hexdigest()
        self.adapter.EXPECTED_SHA256 = checksum

    def test_reads_exact_columns_and_preserves_zero_vs_null(self) -> None:
        fixture_workbook(self.workbook, list(self.adapter.EXPECTED_HEADERS))
        self.pin_fixture_checksum()

        payload = self.adapter.extract_catalog_rows(self.workbook, self.catalog)

        self.assertEqual(payload["diagnostics"]["catalogScopedSourceRowCount"], 1)
        self.assertEqual(payload["diagnostics"]["unmatchedCatalogTexts"], [])
        self.assertEqual(
            payload["rows"],
            [
                {
                    "generalRank": 7,
                    "lexicalText": "零",
                    "writtenPerMillion": 0,
                    "spokenPerMillion": None,
                }
            ],
        )

    def test_rejects_checksum_mismatch(self) -> None:
        fixture_workbook(self.workbook, list(self.adapter.EXPECTED_HEADERS))
        with self.assertRaisesRegex(ValueError, "checksum"):
            self.adapter.extract_catalog_rows(self.workbook, self.catalog)

    def test_rejects_exact_header_mismatch(self) -> None:
        headers = list(self.adapter.EXPECTED_HEADERS)
        headers[3] = "書面語每百萬詞頻"
        fixture_workbook(self.workbook, headers)
        self.pin_fixture_checksum()
        with self.assertRaisesRegex(ValueError, "headers"):
            self.adapter.extract_catalog_rows(self.workbook, self.catalog)


if __name__ == "__main__":
    unittest.main()

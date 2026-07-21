from __future__ import annotations

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
SCRIPT = ROOT / "scripts" / "project-naer-lexicon-candidates.py"


def load_adapter() -> ModuleType:
    specification = importlib.util.spec_from_file_location(
        "project_naer_lexicon_candidates",
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


def fixture_workbook(path: Path, headers: list[str], rows: list[dict[str, object]]) -> None:
    header_cells = "".join(
        inline_cell(f"{chr(64 + index)}1", header)
        for index, header in enumerate(headers, start=1)
    )
    data_rows = []
    for physical_row, row in enumerate(rows, start=2):
        cells = [
            numeric_cell(f"A{physical_row}", row["rank"]),
            inline_cell(f"B{physical_row}", str(row["text"])),
        ]
        if row.get("written") is not None:
            cells.append(numeric_cell(f"D{physical_row}", row["written"]))
        if row.get("spoken") is not None:
            cells.append(numeric_cell(f"G{physical_row}", row["spoken"]))
        data_rows.append(f'<row r="{physical_row}">{"".join(cells)}</row>')
    worksheet = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        '<dimension ref="A1:L163702"/>'
        f'<sheetData><row r="1">{header_cells}</row>{"".join(data_rows)}</sheetData>'
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


class ProjectNaerLexiconCandidatesTest(unittest.TestCase):
    def setUp(self) -> None:
        self.adapter = load_adapter()
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.workbook = self.root / "fixture.xlsx"

    def source_adapter(self) -> ModuleType:
        source = self.adapter.load_naer_adapter()
        source.EXPECTED_SHA256 = hashlib.sha256(self.workbook.read_bytes()).hexdigest()
        return source

    def test_projects_continuous_rank_prefix_and_preserves_null(self) -> None:
        source = self.adapter.load_naer_adapter()
        fixture_workbook(
            self.workbook,
            list(source.EXPECTED_HEADERS),
            [
                {"rank": 1, "text": "的", "written": 10, "spoken": 20},
                {"rank": 2, "text": "我們", "written": 0, "spoken": None},
                {"rank": 3, "text": "之後", "written": 2.5, "spoken": 3.5},
            ],
        )
        payload = self.adapter.project_top_candidates(
            self.workbook,
            2,
            adapter=self.source_adapter(),
        )

        self.assertEqual(payload["selection"]["selectedCount"], 2)
        self.assertEqual(payload["selection"]["lengthDistribution"], {"1": 1, "2": 1})
        self.assertEqual(
            payload["rows"],
            [
                {
                    "generalRank": 1,
                    "lexicalText": "的",
                    "writtenPerMillion": 10,
                    "spokenPerMillion": 20,
                    "sourcePhysicalRow": 2,
                },
                {
                    "generalRank": 2,
                    "lexicalText": "我們",
                    "writtenPerMillion": 0,
                    "spokenPerMillion": None,
                    "sourcePhysicalRow": 3,
                },
            ],
        )

    def test_rejects_non_continuous_prefix(self) -> None:
        source = self.adapter.load_naer_adapter()
        fixture_workbook(
            self.workbook,
            list(source.EXPECTED_HEADERS),
            [
                {"rank": 1, "text": "的", "written": 10, "spoken": 20},
                {"rank": 3, "text": "一", "written": 5, "spoken": 6},
            ],
        )
        with self.assertRaisesRegex(ValueError, "continuous"):
            self.adapter.project_top_candidates(
                self.workbook,
                2,
                adapter=self.source_adapter(),
            )

    def test_rejects_non_han_candidate(self) -> None:
        source = self.adapter.load_naer_adapter()
        fixture_workbook(
            self.workbook,
            list(source.EXPECTED_HEADERS),
            [{"rank": 1, "text": "AI", "written": 1, "spoken": 1}],
        )
        with self.assertRaisesRegex(ValueError, "non-Han"):
            self.adapter.project_top_candidates(
                self.workbook,
                1,
                adapter=self.source_adapter(),
            )


if __name__ == "__main__":
    unittest.main()

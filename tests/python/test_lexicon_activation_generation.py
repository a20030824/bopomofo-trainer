from __future__ import annotations

import csv
import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path
from types import ModuleType
from unittest import mock

ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = ROOT / "scripts"
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

from lexicon_candidate_set import canonical_digest

SCRIPT = SCRIPTS / "project-lexicon-activation-generation.py"


def load_adapter() -> ModuleType:
    specification = importlib.util.spec_from_file_location(
        "project_lexicon_activation_generation_test",
        SCRIPT,
    )
    if specification is None or specification.loader is None:
        raise RuntimeError(f"cannot load adapter: {SCRIPT}")
    module = importlib.util.module_from_spec(specification)
    sys.modules[specification.name] = module
    specification.loader.exec_module(module)
    return module


def write_json(path: Path, value: object) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def write_candidate_generation(
    candidate_path: Path,
    manifest_path: Path,
    rows: list[tuple[int, str]] | None = None,
) -> None:
    rows = rows if rows is not None else [(1, "甲"), (10_000, "乙")]
    with candidate_path.open("w", encoding="utf-8", newline="") as destination:
        writer = csv.DictWriter(
            destination,
            fieldnames=[
                "text",
                "status",
                "naer_general_rank",
                "written_per_million",
                "spoken_per_million",
            ],
        )
        writer.writeheader()
        for rank, text in rows:
            writer.writerow({
                "text": text,
                "status": "provisional",
                "naer_general_rank": rank,
                "written_per_million": "",
                "spoken_per_million": "",
            })
    manifest_rows = [
        {
            "generalRank": rank,
            "lexicalText": text,
            "writtenPerMillion": None,
            "spokenPerMillion": None,
        }
        for rank, text in rows
    ]
    digest_rows = [
        {
            "generalRank": row["generalRank"],
            "lexicalText": row["lexicalText"],
            "spokenPerMillion": None,
            "writtenPerMillion": None,
        }
        for row in manifest_rows
    ]
    write_json(manifest_path, {
        "adapterVersion": "naer-lexicon-candidates-adapter-v2",
        "selection": {
            "limit": 10_000,
            "selectedCount": len(rows),
            "normalizedTextCount": len({text for _, text in rows}),
            "determinismDigest": canonical_digest(digest_rows),
        },
        "rows": manifest_rows,
    })


class LexiconActivationGenerationTest(unittest.TestCase):
    def setUp(self) -> None:
        self.adapter = load_adapter()
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.candidates = self.root / "candidates.csv"
        self.manifest = self.root / "manifest.json"
        self.reading_coverage = self.root / "reading-coverage.json"
        self.concised = self.root / "concised.json"
        self.revised = self.root / "revised.json"
        self.cedict = self.root / "cedict.json"
        self.catalog = self.root / "catalog.csv"
        write_candidate_generation(self.candidates, self.manifest)
        write_json(self.reading_coverage, {
            "adapterVersion": "naer-reading-coverage-summary-v1",
            "candidateCount": 2,
            "reviewQueue": [{"text": "乙", "status": "unmatched"}],
            "determinismDigest": "reading-digest",
        })
        write_json(self.concised, {
            "adapterVersion": "moe-concised-reading-adapter-v1",
            "rows": [{"lookupText": "甲", "trainerReading": "ㄐㄧㄚ3"}],
        })
        write_json(self.revised, {
            "adapterVersion": "moe-revised-reading-fallback-adapter-v1",
            "rows": [],
        })
        write_json(self.cedict, {
            "adapterVersion": "cedict-identity-hints-adapter-v1",
            "rows": [],
        })
        with self.catalog.open("w", encoding="utf-8", newline="") as destination:
            writer = csv.DictWriter(destination, fieldnames=["text", "reading"])
            writer.writeheader()
            writer.writerow({"text": "甲", "reading": "ㄐㄧㄚ3"})

    def test_separates_catalog_identity_from_runtime_admission(self) -> None:
        report = self.adapter.project_activation_generation(
            candidates=self.candidates,
            candidate_manifest=self.manifest,
            reading_coverage_path=self.reading_coverage,
            concised_path=self.concised,
            revised_path=self.revised,
            cedict_path=self.cedict,
            active_catalog_path=self.catalog,
        )

        self.assertEqual(report["sourceRankLimit"], 10_000)
        self.assertEqual(
            report["statusCounts"],
            {
                "already-active-exact-identity": 1,
                "reading-review-required": 1,
            },
        )
        self.assertFalse(report["policy"]["catalogActivationRequiresRuntimeAdmission"])
        self.assertEqual(report["rows"][1]["generalRank"], 10_000)
        self.assertNotIn("syntaxEvidence", report["rows"][1])

    def test_human_review_csv_keeps_only_decision_fields(self) -> None:
        report = self.adapter.project_activation_generation(
            candidates=self.candidates,
            candidate_manifest=self.manifest,
            reading_coverage_path=self.reading_coverage,
            concised_path=self.concised,
            revised_path=self.revised,
            cedict_path=self.cedict,
            active_catalog_path=self.catalog,
        )
        output = self.root / "activation-review.csv"
        self.adapter.write_activation_csv(output, report)

        with output.open("r", encoding="utf-8", newline="") as source:
            reader = csv.DictReader(source)
            rows = list(reader)

        self.assertEqual(
            reader.fieldnames,
            [
                "general_rank",
                "text",
                "status",
                "reading_authority",
                "reading",
                "reading_review_status",
                "ud_occurrence_count",
                "ud_upos",
            ],
        )
        self.assertEqual(rows[0]["reading"], "ㄐㄧㄚ3")
        self.assertEqual(rows[1]["reading_review_status"], "unmatched")

    def test_converts_cedict_pinyin_before_catalog_identity_comparison(self) -> None:
        write_json(self.reading_coverage, {
            "adapterVersion": "naer-reading-coverage-summary-v1",
            "candidateCount": 2,
            "reviewQueue": [],
            "determinismDigest": "reading-digest",
        })
        write_json(self.cedict, {
            "adapterVersion": "cedict-identity-hints-adapter-v1",
            "rows": [{
                "lookupText": "乙",
                "status": "unique-record",
                "records": [{"pinyin": "yi3"}],
            }],
        })
        with self.catalog.open("a", encoding="utf-8", newline="") as destination:
            writer = csv.DictWriter(destination, fieldnames=["text", "reading"])
            writer.writerow({"text": "乙", "reading": "ㄧ3"})

        with mock.patch.object(
            self.adapter,
            "convert_numbered_pinyin",
            return_value=[("ㄧ3", None)],
        ) as converter:
            report = self.adapter.project_activation_generation(
                candidates=self.candidates,
                candidate_manifest=self.manifest,
                reading_coverage_path=self.reading_coverage,
                concised_path=self.concised,
                revised_path=self.revised,
                cedict_path=self.cedict,
                active_catalog_path=self.catalog,
            )

        converter.assert_called_once_with(["yi3"])
        self.assertEqual(
            report["statusCounts"],
            {"already-active-exact-identity": 2},
        )
        reading = report["rows"][1]["reading"]
        self.assertEqual(reading["evidenceType"], "trainer-bopomofo")
        self.assertEqual(reading["evidence"], "ㄧ3")
        self.assertEqual(reading["sourceEvidence"], "yi3")

    def test_unsupported_cedict_pinyin_syllable_routes_to_review_instead_of_raising(self) -> None:
        write_json(self.reading_coverage, {
            "adapterVersion": "naer-reading-coverage-summary-v1",
            "candidateCount": 2,
            "reviewQueue": [],
            "determinismDigest": "reading-digest",
        })
        write_json(self.cedict, {
            "adapterVersion": "cedict-identity-hints-adapter-v1",
            "rows": [{
                "lookupText": "乙",
                "status": "unique-record",
                "records": [{"pinyin": "na3 r5"}],
            }],
        })

        with mock.patch.object(
            self.adapter,
            "convert_numbered_pinyin",
            return_value=[(None, 'unsupported pinyin final "" in syllable "r"')],
        ):
            report = self.adapter.project_activation_generation(
                candidates=self.candidates,
                candidate_manifest=self.manifest,
                reading_coverage_path=self.reading_coverage,
                concised_path=self.concised,
                revised_path=self.revised,
                cedict_path=self.cedict,
                active_catalog_path=self.catalog,
            )

        self.assertEqual(
            report["statusCounts"],
            {"already-active-exact-identity": 1, "reading-review-required": 1},
        )
        review_row = report["rows"][1]
        self.assertEqual(review_row["generalRank"], 10_000)
        self.assertIn("cedict-numbered-pinyin-unsupported", review_row["readingReviewStatus"])

    def test_unmatched_compound_derives_reading_from_resolved_components(self) -> None:
        write_candidate_generation(
            self.candidates,
            self.manifest,
            rows=[(1, "走"), (2, "到"), (3, "走到")],
        )
        write_json(self.reading_coverage, {
            "adapterVersion": "naer-reading-coverage-summary-v1",
            "candidateCount": 3,
            "reviewQueue": [{"text": "走到", "status": "unmatched"}],
            "determinismDigest": "reading-digest",
        })
        write_json(self.concised, {
            "adapterVersion": "moe-concised-reading-adapter-v1",
            "rows": [
                {"lookupText": "走", "trainerReading": "ㄗㄡˇ3"},
                {"lookupText": "到", "trainerReading": "ㄉㄠˋ4"},
            ],
        })

        report = self.adapter.project_activation_generation(
            candidates=self.candidates,
            candidate_manifest=self.manifest,
            reading_coverage_path=self.reading_coverage,
            concised_path=self.concised,
            revised_path=self.revised,
            cedict_path=self.cedict,
            active_catalog_path=self.catalog,
        )

        self.assertEqual(report["statusCounts"], {"resolved-new-identity": 3})
        compound_row = next(row for row in report["rows"] if row["text"] == "走到")
        self.assertEqual(compound_row["reading"]["authority"], "derived-component-concatenation")
        self.assertEqual(compound_row["reading"]["evidence"], "ㄗㄡˇ3 ㄉㄠˋ4")

    def test_component_derivation_skips_tone_sandhi_risk_characters(self) -> None:
        write_candidate_generation(
            self.candidates,
            self.manifest,
            rows=[(1, "一"), (2, "定"), (3, "一定")],
        )
        write_json(self.reading_coverage, {
            "adapterVersion": "naer-reading-coverage-summary-v1",
            "candidateCount": 3,
            "reviewQueue": [
                {"text": "一", "status": "unmatched"},
                {"text": "一定", "status": "unmatched"},
            ],
            "determinismDigest": "reading-digest",
        })
        write_json(self.concised, {
            "adapterVersion": "moe-concised-reading-adapter-v1",
            "rows": [{"lookupText": "定", "trainerReading": "ㄉㄧㄥˋ4"}],
        })

        report = self.adapter.project_activation_generation(
            candidates=self.candidates,
            candidate_manifest=self.manifest,
            reading_coverage_path=self.reading_coverage,
            concised_path=self.concised,
            revised_path=self.revised,
            cedict_path=self.cedict,
            active_catalog_path=self.catalog,
        )

        self.assertEqual(
            report["statusCounts"],
            {"resolved-new-identity": 1, "reading-review-required": 2},
        )
        compound_row = next(row for row in report["rows"] if row["text"] == "一定")
        self.assertIsNone(compound_row["reading"])

    def test_component_derivation_skips_character_with_undeclared_alternate_reading(self) -> None:
        write_candidate_generation(
            self.candidates,
            self.manifest,
            rows=[(1, "台"), (2, "北"), (3, "台北")],
        )
        write_json(self.reading_coverage, {
            "adapterVersion": "naer-reading-coverage-summary-v1",
            "candidateCount": 3,
            "reviewQueue": [{"text": "台北", "status": "unmatched"}],
            "determinismDigest": "reading-digest",
        })
        write_json(self.concised, {
            "adapterVersion": "moe-concised-reading-adapter-v1",
            "rows": [
                {
                    "lookupText": "台",
                    "trainerReading": "ㄧ2",
                    "multiReadingReference": "(二)ㄊㄞˊ　　tái（▲1348臺）",
                },
                {"lookupText": "北", "trainerReading": "ㄅㄟˇ3"},
            ],
        })

        report = self.adapter.project_activation_generation(
            candidates=self.candidates,
            candidate_manifest=self.manifest,
            reading_coverage_path=self.reading_coverage,
            concised_path=self.concised,
            revised_path=self.revised,
            cedict_path=self.cedict,
            active_catalog_path=self.catalog,
        )

        self.assertEqual(
            report["statusCounts"],
            {"resolved-new-identity": 2, "reading-review-required": 1},
        )
        compound_row = next(row for row in report["rows"] if row["text"] == "台北")
        self.assertIsNone(compound_row["reading"])


if __name__ == "__main__":
    unittest.main()

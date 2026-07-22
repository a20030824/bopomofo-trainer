from __future__ import annotations

import csv
import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))

import activation_review_batch as batch  # noqa: E402

BASELINE_ACTIVE_CATALOG = ROOT / "tests/fixtures/catalog-baseline-49.csv"


def write_csv(path: Path, fieldnames: list[str], rows: list[dict[str, object]]) -> None:
    with path.open("w", encoding="utf-8", newline="") as destination:
        writer = csv.DictWriter(destination, fieldnames=fieldnames, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)


class ActivationReviewBatchTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.candidates = self.root / "candidates.csv"
        texts = list("甲乙丙丁戊己庚辛壬癸子")
        write_csv(
            self.candidates,
            [
                "text", "status", "naer_general_rank", "written_per_million",
                "spoken_per_million", "provenance_ids",
            ],
            [{
                "text": text,
                "status": "provisional",
                "naer_general_rank": rank,
                "written_per_million": 100 - rank,
                "spoken_per_million": 100 - rank,
                "provenance_ids": "fixture",
            } for rank, text in enumerate(texts, start=1)],
        )
        self.active = self.root / "active.csv"
        write_csv(
            self.active,
            ["text", "reading", "frequency_band", "tags", "status", "provenance_ids"],
            [{
                "text": "甲", "reading": "ㄐㄧㄚ3", "frequency_band": 1,
                "tags": "general", "status": "provisional", "provenance_ids": "fixture",
            }],
        )

        self.reading_coverage = self.write_json("reading-coverage.json", {
            "adapterVersion": "naer-reading-coverage-summary-v1",
            "determinismDigest": "reading-fixture",
            "reviewQueue": [{"generalRank": 2, "text": "乙", "status": "unmatched"}],
        })
        concised_texts = ["甲", "丙", "丁", "戊", "己", "庚", "辛", "子"]
        self.concised = self.write_json("concised.json", {
            "adapterVersion": "moe-concised-reading-adapter-v1",
            "rows": [{"lookupText": text, "trainerReading": f"reading-{text}"} for text in concised_texts],
        })
        self.revised = self.write_json("revised.json", {
            "adapterVersion": "moe-revised-reading-fallback-adapter-v1",
            "rows": [{"lookupText": "壬", "trainerReading": "reading-壬"}],
        })
        self.cedict = self.write_json("cedict.json", {
            "adapterVersion": "cedict-identity-hints-adapter-v1",
            "rows": [{
                "lookupText": "癸", "status": "unique-record",
                "records": [{"pinyin": "gui3"}],
            }],
        })

        specs = {
            "甲": (20, {"NOUN": 20}, ["NOUN"], None),
            "乙": (20, {"NOUN": 20}, ["NOUN"], None),
            "丙": (20, {"VERB": 20}, ["VERB"], "object-bearing-only"),
            "丁": (4, {"NOUN": 4}, ["NOUN"], None),
            "戊": (20, {"NOUN": 10, "VERB": 10}, ["NOUN", "VERB"], None),
            "己": (20, {"ADV": 20}, ["ADV"], None),
            "庚": (20, {"PART": 20}, ["PART"], None),
            "辛": (20, {"NOUN": 20}, ["NOUN"], None),
            "壬": (20, {"VERB": 20}, ["VERB"], "object-bearing-only"),
            "癸": (20, {"AUX": 20}, ["AUX"], None),
            "子": (20, {"ADJ": 20}, ["ADJ"], None),
        }
        evidence_rows = []
        for rank, text in enumerate(texts, start=1):
            occurrence, upos, dominant, frame = specs[text]
            row = {
                "generalRank": rank,
                "text": text,
                "observed": True,
                "occurrenceCount": occurrence,
                "uposCounts": upos,
                "dominantUpos": dominant,
                "dependencyRelationCounts": {"root": occurrence},
                "rootCount": occurrence,
            }
            if frame:
                row["verbEvidence"] = {
                    "verbalOccurrenceCount": occurrence,
                    "observedObjectFrame": frame,
                }
            evidence_rows.append(row)
        self.ud_evidence = self.write_json("ud-evidence.json", {
            "adapterVersion": "ud-chinese-gsd-grammar-evidence-adapter-v1",
            "candidateCount": len(texts),
            "rows": evidence_rows,
            "determinismDigest": "ud-evidence-fixture",
        })
        self.ud_coverage = self.write_json("ud-coverage.json", {
            "adapterVersion": "ud-chinese-gsd-grammar-evidence-adapter-v1",
            "evidenceDigest": "ud-evidence-fixture",
            "determinismDigest": "ud-coverage-fixture",
            "reviewPolicy": {
                "mixedUpos": {
                    "minimumCountPerCategory": 2,
                    "minimumOccurrenceSharePerCategory": 0.1,
                }
            },
            "reviewQueue": [{"generalRank": 3, "text": "丙", "reasons": ["mixed-object-frame-evidence"]}],
        })

    def write_json(self, name: str, payload: dict[str, object]) -> Path:
        path = self.root / name
        path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
        return path

    def build(self, **kwargs):
        arguments = {
            "candidate_path": self.candidates,
            "reading_coverage_path": self.reading_coverage,
            "concised_path": self.concised,
            "revised_path": self.revised,
            "cedict_path": self.cedict,
            "ud_evidence_path": self.ud_evidence,
            "ud_coverage_path": self.ud_coverage,
            "active_catalog_path": self.active,
            "expected_candidate_count": 11,
            "expected_active_catalog_count": 1,
            "expected_reading_digest": "reading-fixture",
            "expected_reading_review_count": 1,
            "expected_ud_evidence_digest": "ud-evidence-fixture",
            "expected_ud_coverage_digest": "ud-coverage-fixture",
            "expected_ud_review_count": 1,
            "batch_size": 3,
            "minimum_occurrences": 5,
        }
        arguments.update(kwargs)
        return batch.build(**arguments)

    def test_selects_rank_first_without_lane_quotas(self) -> None:
        rendered, report = self.build()
        rows = list(csv.DictReader(rendered.decode("utf-8").splitlines()))
        self.assertEqual([row["text"] for row in rows], ["辛", "壬", "癸"])
        self.assertEqual(
            [row["review_lane"] for row in rows],
            ["nominal-evidence", "verbal-evidence", "auxiliary-evidence"],
        )
        self.assertEqual(
            [row["reading_authority"] for row in rows],
            ["moe-concised", "moe-revised", "cedict-unique"],
        )
        self.assertEqual(rows[2]["reading_evidence"], "gui3")
        self.assertEqual(report["eligibleCandidateCount"], 4)
        self.assertEqual(report["selectedRankRange"], {"first": 8, "last": 10})
        self.assertEqual(report["exclusionCounts"], {
            "active-catalog": 1,
            "reading-review-required": 1,
            "ud-syntax-review-required": 1,
            "insufficient-ud-occurrences": 1,
            "unstable-dominant-upos": 1,
            "unsupported-template-evidence": 2,
        })
        self.assertEqual(report["policy"]["laneQuota"], "none")
        self.assertEqual(report["policy"]["automaticProductGrammarRoleAssignment"], "forbidden")

    def test_rejects_stale_reading_digest(self) -> None:
        with self.assertRaisesRegex(ValueError, "reading coverage digest mismatch"):
            self.build(expected_reading_digest="wrong")

    def test_outputs_are_lf_stable(self) -> None:
        rendered, report = self.build()
        csv_path = self.root / "batch.csv"
        report_path = self.root / "report.json"
        batch.write_outputs(csv_path, report_path, rendered, report)
        self.assertNotIn(b"\r\n", csv_path.read_bytes())
        self.assertNotIn(b"\r\n", report_path.read_bytes())
        self.assertTrue(report_path.read_bytes().endswith(b"\n"))

    def test_committed_artifacts_match_projection(self) -> None:
        batch_path = ROOT / batch.DEFAULT_BATCH_OUTPUT
        report_path = ROOT / batch.DEFAULT_REPORT_OUTPUT
        if not batch_path.exists() or not report_path.exists():
            self.skipTest("activation-review batch artifacts are not committed yet")
        rendered, report = batch.build(active_catalog_path=BASELINE_ACTIVE_CATALOG)
        self.assertEqual(batch_path.read_bytes(), rendered)
        self.assertEqual(json.loads(report_path.read_text(encoding="utf-8")), report)
        self.assertEqual(report["selectedCount"], 100)
        self.assertEqual(len(report["selectedTexts"]), 100)


if __name__ == "__main__":
    unittest.main()

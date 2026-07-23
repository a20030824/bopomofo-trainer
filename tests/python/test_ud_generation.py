from __future__ import annotations

import csv
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = ROOT / "scripts"
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

from lexicon_candidate_set import canonical_digest
from ud_grammar_evidence import generation
from ud_grammar_evidence.common import Observation


def write_json(path: Path, value: object) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def write_candidate_generation(candidate_path: Path, manifest_path: Path) -> None:
    rows = [(1, "甲"), (10_000, "乙")]
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
    write_json(manifest_path, {
        "adapterVersion": "naer-lexicon-candidates-adapter-v2",
        "selection": {
            "limit": 10_000,
            "selectedCount": 2,
            "normalizedTextCount": 2,
            "determinismDigest": canonical_digest([
                {
                    "generalRank": row["generalRank"],
                    "lexicalText": row["lexicalText"],
                    "spokenPerMillion": None,
                    "writtenPerMillion": None,
                }
                for row in manifest_rows
            ]),
        },
        "rows": manifest_rows,
    })


class UdGenerationTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.candidates = self.root / "candidates.csv"
        self.manifest = self.root / "manifest.json"
        write_candidate_generation(self.candidates, self.manifest)

    def test_uses_manifest_count_checksum_and_sparse_rank_buckets(self) -> None:
        def fake_project(
            candidate_path: Path,
            source_dir: Path,
            *,
            expected_candidate_count: int,
            expected_candidate_checksum: str,
            expected_files: object,
        ) -> tuple[dict[str, object], dict[str, object]]:
            candidates = generation.projector.load_candidates(
                candidate_path,
                expected_candidate_count,
                expected_candidate_checksum,
            )
            observations = {candidate.text: Observation() for candidate in candidates}
            observations["甲"].occurrence_count = 3
            buckets = generation.projector.rank_bucket_summary(candidates, observations)
            self.assertEqual(buckets[-1]["endRank"], 10_000)
            self.assertEqual(buckets[-1]["candidateCount"], 1)
            evidence = {
                "adapterVersion": "ud-chinese-gsd-grammar-evidence-adapter-v2",
                "schemaVersion": "ud-syntax-evidence-v2",
                "source": {"sourceId": "ud:test", "redistributionBoundary": "legacy"},
                "candidateSource": {},
                "candidateCount": 2,
                "rows": [
                    {"generalRank": 1, "text": "甲", "observed": True, "occurrenceCount": 3},
                    {"generalRank": 10_000, "text": "乙", "observed": False, "occurrenceCount": 0},
                ],
                "determinismDigest": "evidence-digest",
            }
            coverage = {
                "adapterVersion": "ud-chinese-gsd-grammar-evidence-adapter-v2",
                "schemaVersion": "ud-syntax-evidence-v2",
                "sourceId": "ud:test",
                "release": "test",
                "evidenceDigest": "evidence-digest",
                "candidateCount": 2,
                "observedCandidateCount": 1,
                "unseenCandidateCount": 1,
                "matchedOccurrenceCount": 3,
                "rankBuckets": buckets,
                "reviewCandidateCount": 1,
                "reviewQueue": [],
                "determinismDigest": "legacy-coverage-digest",
            }
            return evidence, coverage

        with mock.patch.object(generation.projector, "project", side_effect=fake_project):
            evidence, coverage = generation.project_generation(
                self.candidates,
                self.manifest,
                self.root,
                expected_files={},
            )

        self.assertEqual(evidence["candidateSource"]["manifestLineage"]["sourceRankLimit"], 10_000)
        self.assertEqual(coverage["rankBuckets"][-1]["endRank"], 10_000)
        self.assertNotEqual(coverage["determinismDigest"], "legacy-coverage-digest")


if __name__ == "__main__":
    unittest.main()

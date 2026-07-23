from __future__ import annotations

import csv
import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path
from types import ModuleType

ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = ROOT / "scripts"
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

from lexicon_candidate_set import canonical_digest, load_candidate_set, rank_intervals

SUMMARY_SCRIPT = SCRIPTS / "summarize-naer-reading-coverage.py"


def load_summary_adapter() -> ModuleType:
    specification = importlib.util.spec_from_file_location(
        "summarize_naer_reading_coverage_generation_test",
        SUMMARY_SCRIPT,
    )
    if specification is None or specification.loader is None:
        raise RuntimeError(f"cannot load adapter: {SUMMARY_SCRIPT}")
    module = importlib.util.module_from_spec(specification)
    sys.modules[specification.name] = module
    specification.loader.exec_module(module)
    return module


def write_json(path: Path, value: object) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def write_candidates(path: Path, rows: list[tuple[int, str]]) -> None:
    with path.open("w", encoding="utf-8", newline="") as destination:
        writer = csv.DictWriter(
            destination,
            fieldnames=[
                "text",
                "status",
                "naer_general_rank",
                "written_per_million",
                "spoken_per_million",
                "provenance_ids",
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
                "provenance_ids": "naer:test",
            })


def write_manifest(path: Path, rows: list[tuple[int, str]], limit: int) -> None:
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
            "spokenPerMillion": row["spokenPerMillion"],
            "writtenPerMillion": row["writtenPerMillion"],
        }
        for row in manifest_rows
    ]
    write_json(path, {
        "adapterVersion": "naer-lexicon-candidates-adapter-v2",
        "selection": {
            "limit": limit,
            "selectedCount": len(rows),
            "normalizedTextCount": len(rows),
            "determinismDigest": canonical_digest(digest_rows),
        },
        "rows": manifest_rows,
    })


class LexiconCandidateGenerationTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)

    def test_manifest_preserves_sparse_source_ranks(self) -> None:
        candidates = self.root / "candidates.csv"
        manifest = self.root / "manifest.json"
        rows = [(1, "甲"), (10_000, "乙")]
        write_candidates(candidates, rows)
        write_manifest(manifest, rows, 10_000)

        generation = load_candidate_set(candidates, manifest)

        self.assertEqual(generation.ranks, (1, 10_000))
        self.assertEqual(generation.source_rank_limit, 10_000)
        self.assertEqual(
            rank_intervals(generation.source_rank_limit),
            [
                (1, 100),
                (101, 250),
                (251, 500),
                (501, 1_000),
                (1_001, 2_500),
                (2_501, 5_000),
                (5_001, 10_000),
            ],
        )

    def test_manifest_rejects_candidate_identity_drift(self) -> None:
        candidates = self.root / "candidates.csv"
        manifest = self.root / "manifest.json"
        write_candidates(candidates, [(1, "甲")])
        write_manifest(manifest, [(1, "乙")], 1)

        with self.assertRaisesRegex(ValueError, "digest mismatch|do not exactly match"):
            load_candidate_set(candidates, manifest)

    def test_reading_coverage_buckets_use_source_rank_limit(self) -> None:
        adapter = load_summary_adapter()
        candidates = self.root / "candidates.csv"
        manifest = self.root / "manifest.json"
        concised = self.root / "concised.json"
        revised = self.root / "revised.json"
        cedict = self.root / "cedict.json"
        rows = [(1, "甲"), (10_000, "乙")]
        write_candidates(candidates, rows)
        write_manifest(manifest, rows, 10_000)
        write_json(concised, {
            "adapterVersion": "moe-concised-reading-adapter-v1",
            "rows": [{"lookupText": "甲", "trainerReading": "ㄐㄧㄚ3"}],
        })
        write_json(revised, {
            "adapterVersion": "moe-revised-reading-fallback-adapter-v1",
            "rows": [],
        })
        write_json(cedict, {
            "adapterVersion": "cedict-identity-hints-adapter-v1",
            "resolutionBasis": {
                "candidateEntryCount": 2,
                "cedictTargetTexts": ["乙"],
            },
            "rows": [{
                "lookupText": "乙",
                "status": "unique-record",
                "records": [{"sourceLine": 1, "pinyin": "yi3"}],
            }],
            "diagnostics": {"unmatchedTexts": []},
        })

        result = adapter.summarize_coverage(
            candidates,
            concised,
            revised,
            cedict,
            manifest,
        )

        self.assertEqual(result["candidateCount"], 2)
        self.assertEqual(result["rankBuckets"][-1]["endRank"], 10_000)
        self.assertEqual(result["rankBuckets"][-1]["counts"]["cedictUnique"], 1)
        self.assertEqual(
            result["inputs"]["candidateManifest"]["sourceRankLimit"],
            10_000,
        )


if __name__ == "__main__":
    unittest.main()

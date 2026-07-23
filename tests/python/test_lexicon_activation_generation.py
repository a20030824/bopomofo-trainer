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
            "selectedCount": 2,
            "normalizedTextCount": 2,
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


if __name__ == "__main__":
    unittest.main()

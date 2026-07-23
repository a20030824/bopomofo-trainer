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
SCRIPT = ROOT / "scripts" / "summarize-naer-reading-coverage.py"


def load_adapter() -> ModuleType:
    specification = importlib.util.spec_from_file_location(
        "summarize_naer_reading_coverage",
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


class SummarizeNaerReadingCoverageTest(unittest.TestCase):
    def setUp(self) -> None:
        self.adapter = load_adapter()
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.candidates = self.root / "candidates.csv"
        self.concised = self.root / "concised.json"
        self.revised = self.root / "revised.json"
        self.cedict = self.root / "cedict.json"
        with self.candidates.open("w", encoding="utf-8", newline="") as destination:
            writer = csv.DictWriter(
                destination,
                fieldnames=["text", "status", "naer_general_rank"],
            )
            writer.writeheader()
            for rank, text in enumerate(["甲", "乙", "丙", "丁", "戊"], start=1):
                writer.writerow(
                    {"text": text, "status": "provisional", "naer_general_rank": rank}
                )
        write_json(
            self.concised,
            {
                "adapterVersion": "moe-concised-reading-adapter-v1",
                "rows": [{"lookupText": "甲", "trainerReading": "ㄐㄧㄚ3"}],
            },
        )
        write_json(
            self.revised,
            {
                "adapterVersion": "moe-revised-reading-fallback-adapter-v1",
                "rows": [{"lookupText": "乙", "trainerReading": "ㄧ3"}],
            },
        )
        write_json(
            self.cedict,
            {
                "adapterVersion": "cedict-identity-hints-adapter-v1",
                "resolutionBasis": {
                    "candidateEntryCount": 5,
                    "cedictTargetTexts": ["丙", "丁", "戊"],
                },
                "rows": [
                    {
                        "lookupText": "丙",
                        "status": "unique-record",
                        "records": [
                            {
                                "sourceLine": 10,
                                "traditional": "丙",
                                "simplified": "丙",
                                "pinyin": "bing3",
                                "matchKinds": ["traditional"],
                            }
                        ],
                    },
                    {
                        "lookupText": "丁",
                        "status": "ambiguous-records",
                        "records": [
                            {"sourceLine": 11, "traditional": "丁", "simplified": "丁", "pinyin": "ding1"},
                            {"sourceLine": 12, "traditional": "丁", "simplified": "丁", "pinyin": "zheng1"},
                        ],
                    },
                ],
                "diagnostics": {"unmatchedTexts": ["戊"]},
            },
        )

    def test_summarizes_authority_partition_and_ranked_review(self) -> None:
        payload = self.adapter.summarize_coverage(
            self.candidates,
            self.concised,
            self.revised,
            self.cedict,
        )

        self.assertEqual(
            payload["coverage"],
            {
                "moeConcisedUnique": 1,
                "moeRevisedUniqueFallback": 1,
                "cedictUniqueFallback": 1,
                "automaticallyResolved": 3,
                "reviewRequired": 2,
                "cedictAmbiguous": 1,
                "unmatched": 1,
            },
        )
        self.assertEqual(
            [(row["generalRank"], row["text"], row["status"]) for row in payload["reviewQueue"]],
            [(4, "丁", "ambiguous-cedict"), (5, "戊", "unmatched")],
        )

    def test_rejects_moe_overlap(self) -> None:
        write_json(
            self.revised,
            {
                "adapterVersion": "moe-revised-reading-fallback-adapter-v1",
                "rows": [{"lookupText": "甲", "trainerReading": "ㄐㄧㄚ3"}],
            },
        )
        with self.assertRaisesRegex(ValueError, "overlap"):
            self.adapter.summarize_coverage(
                self.candidates,
                self.concised,
                self.revised,
                self.cedict,
            )

if __name__ == "__main__":
    unittest.main()

from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tests" / "python"))

from active_catalog_state import active_catalog_size, active_concised_count  # noqa: E402

ARTIFACT = ROOT / "data" / "readings" / "moe-revised-2015_20260625-active-catalog-fallback.json"


class MoeRevisedProjectionArtifactTest(unittest.TestCase):
    def test_projection_is_small_sorted_and_scoped_to_concised_gaps(self) -> None:
        payload = json.loads(ARTIFACT.read_text(encoding="utf-8"))
        rows = payload["rows"]
        basis = payload["fallbackBasis"]
        diagnostics = payload["diagnostics"]

        self.assertEqual(payload["adapterVersion"], "moe-revised-reading-fallback-adapter-v1")
        self.assertEqual(payload["source"]["sourceVersion"], "2015_20260625")
        # Both counts are cross-file bookkeeping (they mirror the Concised
        # artifact's own row count and the overall catalog size) rather than
        # facts owned by this file, so they are read dynamically.
        self.assertEqual(basis["concisedAcceptedCandidateCount"], active_concised_count())
        self.assertEqual(
            basis["fallbackCandidateCount"],
            active_catalog_size() - active_concised_count(),
        )
        self.assertEqual(len(rows), diagnostics["acceptedFallbackCount"])
        self.assertEqual(
            [row["lookupText"] for row in rows],
            ["中國", "中文", "大陸", "日本", "總統", "美國", "謝謝"],
        )
        self.assertTrue(all(row["fallbackStatus"] == "provisional" for row in rows))
        self.assertEqual(diagnostics["multipleReadingTexts"], ["東西"])
        self.assertEqual(
            diagnostics["unmatchedFallbackTexts"],
            ["台灣", "很好", "想要", "看到", "聽到"],
        )
        self.assertLess(ARTIFACT.stat().st_size, 100_000)

    def test_projection_preserves_exact_revised_evidence(self) -> None:
        payload = json.loads(ARTIFACT.read_text(encoding="utf-8"))
        rows = {row["lookupText"]: row for row in payload["rows"]}

        self.assertEqual(rows["中文"]["sourceBopomofo"], "ㄓㄨㄥ ㄨㄣˊ")
        self.assertEqual(rows["中文"]["trainerReading"], "ㄓㄨㄥ1 ㄨㄣ2")
        self.assertEqual(rows["中國"]["sourceBopomofo"], "ㄓㄨㄥ ㄍㄨㄛˊ")
        self.assertEqual(rows["中國"]["trainerReading"], "ㄓㄨㄥ1 ㄍㄨㄛ2")
        self.assertEqual(rows["美國"]["sourceBopomofo"], "ㄇㄟˇ ㄍㄨㄛˊ")
        self.assertEqual(rows["美國"]["trainerReading"], "ㄇㄟ3 ㄍㄨㄛ2")
        self.assertEqual(rows["謝謝"]["sourceBopomofo"], "ㄒㄧㄝˋ ˙ㄒㄧㄝ")
        self.assertEqual(rows["謝謝"]["trainerReading"], "ㄒㄧㄝ4 ㄒㄧㄝ5")


if __name__ == "__main__":
    unittest.main()

from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tests" / "python"))

from active_catalog_state import active_catalog_text_count  # noqa: E402

ARTIFACT = ROOT / "data" / "readings" / "moe-concised-2014_20260626-active-catalog.json"


class MoeConcisedProjectionArtifactTest(unittest.TestCase):
    def test_projection_is_small_sorted_and_self_consistent(self) -> None:
        payload = json.loads(ARTIFACT.read_text(encoding="utf-8"))
        rows = payload["rows"]
        diagnostics = payload["diagnostics"]

        self.assertEqual(payload["adapterVersion"], "moe-concised-reading-adapter-v1")
        self.assertEqual(payload["source"]["sourceVersion"], "2014_20260626")
        # entryCount/normalizedTextCount scope to the whole active catalog's
        # distinct texts, not just the rows Concised happened to resolve, and
        # not the row count (a heteronym text can have several active rows)
        # -- read dynamically so this doesn't need editing every time the
        # catalog grows.
        self.assertEqual(payload["candidateSet"]["entryCount"], active_catalog_text_count())
        self.assertEqual(payload["candidateSet"]["normalizedTextCount"], active_catalog_text_count())
        self.assertEqual(len(rows), diagnostics["acceptedCandidateCount"])
        self.assertEqual(
            [row["lookupText"] for row in rows],
            sorted(row["lookupText"] for row in rows),
        )
        self.assertEqual(diagnostics["multipleReadingTexts"], ["東西"])
        self.assertEqual(
            diagnostics["candidateScopedSourceRowCount"],
            len(rows) + 2,
        )
        self.assertLess(ARTIFACT.stat().st_size, 100_000)

    def test_projection_preserves_moe_neutral_tone_evidence(self) -> None:
        payload = json.loads(ARTIFACT.read_text(encoding="utf-8"))
        rows = {row["lookupText"]: row for row in payload["rows"]}

        self.assertEqual(rows["我們"]["sourceBopomofo"], "ㄨㄛˇ　˙ㄇㄣ")
        self.assertEqual(rows["我們"]["trainerReading"], "ㄨㄛ3 ㄇㄣ5")
        self.assertEqual(rows["媽媽"]["trainerReading"], "ㄇㄚ1 ㄇㄚ5")
        self.assertEqual(rows["不會"]["trainerReading"], "ㄅㄨ4 ㄏㄨㄟ4")


if __name__ == "__main__":
    unittest.main()

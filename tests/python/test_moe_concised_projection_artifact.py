from __future__ import annotations

import json
import importlib.util
import sys
import unittest
from pathlib import Path
from types import ModuleType


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tests" / "python"))

from active_catalog_state import active_catalog_size, active_catalog_text_count  # noqa: E402

ARTIFACT = ROOT / "data" / "readings" / "moe-concised-2014_20260626-active-catalog.json"
SCRIPT = ROOT / "scripts" / "project-moe-concised-readings.py"


def load_adapter() -> ModuleType:
    specification = importlib.util.spec_from_file_location(
        "project_moe_concised_readings_artifact",
        SCRIPT,
    )
    if specification is None or specification.loader is None:
        raise RuntimeError(f"cannot load adapter: {SCRIPT}")
    module = importlib.util.module_from_spec(specification)
    sys.modules[specification.name] = module
    specification.loader.exec_module(module)
    return module


class MoeConcisedProjectionArtifactTest(unittest.TestCase):
    def test_projection_is_small_sorted_and_self_consistent(self) -> None:
        payload = json.loads(ARTIFACT.read_text(encoding="utf-8"))
        rows = payload["rows"]
        diagnostics = payload["diagnostics"]

        self.assertEqual(payload["adapterVersion"], "moe-concised-reading-adapter-v1")
        self.assertEqual(payload["source"]["sourceVersion"], "2014_20260626")
        # entryCount tracks exact catalog identities; normalizedTextCount
        # tracks distinct written forms because heteronyms can share text.
        self.assertEqual(payload["candidateSet"]["entryCount"], active_catalog_size())
        self.assertEqual(payload["candidateSet"]["normalizedTextCount"], active_catalog_text_count())
        self.assertEqual(len(rows), diagnostics["acceptedCandidateCount"])
        self.assertEqual(
            [row["lookupText"] for row in rows],
            sorted(row["lookupText"] for row in rows),
        )
        diagnostic_texts = {
            text
            for key in (
                "unmatchedCandidateTexts",
                "ambiguousCandidateTexts",
                "duplicateSourceIdentityTexts",
                "multipleReadingTexts",
            )
            for text in diagnostics[key]
        }
        diagnostic_texts.update(item["text"] for item in diagnostics["invalidReadings"])
        accepted_texts = {row["lookupText"] for row in rows}
        self.assertTrue(accepted_texts.isdisjoint(diagnostic_texts))
        self.assertEqual(len(accepted_texts | diagnostic_texts), active_catalog_text_count())
        self.assertGreaterEqual(diagnostics["candidateScopedSourceRowCount"], len(rows))
        self.assertEqual(
            diagnostics["candidateScopedSourceRowCount"]
            + diagnostics["omittedNonCandidateSourceRowCount"],
            diagnostics["sourceRowCount"],
        )
        self.assertLess(ARTIFACT.stat().st_size, 4_000_000)

    def test_projection_preserves_exact_moe_reading_evidence(self) -> None:
        payload = json.loads(ARTIFACT.read_text(encoding="utf-8"))
        adapter = load_adapter()

        self.assertTrue(payload["rows"])
        for row in payload["rows"]:
            self.assertEqual(
                row["trainerReading"],
                adapter.trainer_reading(row["sourceBopomofo"]),
            )


if __name__ == "__main__":
    unittest.main()

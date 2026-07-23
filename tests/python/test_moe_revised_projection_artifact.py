from __future__ import annotations

import json
import importlib.util
import sys
import unittest
from pathlib import Path
from types import ModuleType


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tests" / "python"))

from active_catalog_state import active_concised_count  # noqa: E402

ARTIFACT = ROOT / "data" / "readings" / "moe-revised-2015_20260625-active-catalog-fallback.json"
CONCISED = ROOT / "data" / "readings" / "moe-concised-2014_20260626-active-catalog.json"
SCRIPT = ROOT / "scripts" / "project-moe-revised-readings.py"


def load_adapter() -> ModuleType:
    specification = importlib.util.spec_from_file_location(
        "project_moe_revised_readings_artifact",
        SCRIPT,
    )
    if specification is None or specification.loader is None:
        raise RuntimeError(f"cannot load adapter: {SCRIPT}")
    module = importlib.util.module_from_spec(specification)
    sys.modules[specification.name] = module
    specification.loader.exec_module(module)
    return module


def expected_fallback_texts() -> list[str]:
    concised = json.loads(CONCISED.read_text(encoding="utf-8"))
    diagnostics = concised["diagnostics"]
    ambiguous = set(diagnostics["ambiguousCandidateTexts"])
    eligible = {
        text
        for key in (
            "unmatchedCandidateTexts",
            "duplicateSourceIdentityTexts",
            "multipleReadingTexts",
        )
        for text in diagnostics[key]
    }
    eligible.update(item["text"] for item in diagnostics["invalidReadings"])
    return sorted(eligible - ambiguous)


class MoeRevisedProjectionArtifactTest(unittest.TestCase):
    def test_projection_is_small_sorted_and_scoped_to_concised_gaps(self) -> None:
        payload = json.loads(ARTIFACT.read_text(encoding="utf-8"))
        rows = payload["rows"]
        basis = payload["fallbackBasis"]
        diagnostics = payload["diagnostics"]

        self.assertEqual(payload["adapterVersion"], "moe-revised-reading-fallback-adapter-v1")
        self.assertEqual(payload["source"]["sourceVersion"], "2015_20260625")
        self.assertEqual(basis["concisedAcceptedCandidateCount"], active_concised_count())
        expected_fallback = expected_fallback_texts()
        self.assertEqual(basis["fallbackCandidateTexts"], expected_fallback)
        self.assertEqual(basis["fallbackCandidateCount"], len(expected_fallback))
        self.assertEqual(len(rows), diagnostics["acceptedFallbackCount"])
        lookup_texts = [row["lookupText"] for row in rows]
        self.assertEqual(lookup_texts, sorted(lookup_texts))
        self.assertTrue(all(row["fallbackStatus"] == "provisional" for row in rows))
        unresolved = set(diagnostics["unmatchedFallbackTexts"])
        unresolved.update(diagnostics["duplicateSourceIdentityTexts"])
        unresolved.update(diagnostics["multipleReadingTexts"])
        unresolved.update(item["text"] for item in diagnostics["invalidReadings"])
        self.assertEqual(set(expected_fallback), set(lookup_texts) | unresolved)
        self.assertTrue(set(lookup_texts).isdisjoint(unresolved))
        self.assertLess(ARTIFACT.stat().st_size, 100_000)

    def test_projection_preserves_exact_revised_evidence(self) -> None:
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

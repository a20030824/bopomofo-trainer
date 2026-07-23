from __future__ import annotations

import importlib.util
import csv
import sys
import unittest
from pathlib import Path
from types import ModuleType

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tests" / "python"))

from active_catalog_state import (  # noqa: E402
    active_catalog_size,
    active_catalog_text_count,
    active_concised_count,
    active_revised_count,
)

SCRIPT = ROOT / "scripts" / "project-cedict-identity-hints.py"
CANDIDATES = ROOT / "data" / "source" / "words.sample.csv"
CONCISED = ROOT / "data" / "readings" / "moe-concised-2014_20260626-active-catalog.json"
REVISED = ROOT / "data" / "readings" / "moe-revised-2015_20260625-active-catalog-fallback.json"


def load_adapter() -> ModuleType:
    specification = importlib.util.spec_from_file_location(
        "project_cedict_identity_hints_basis",
        SCRIPT,
    )
    if specification is None or specification.loader is None:
        raise RuntimeError(f"cannot load adapter: {SCRIPT}")
    module = importlib.util.module_from_spec(specification)
    sys.modules[specification.name] = module
    specification.loader.exec_module(module)
    return module


class CedictResolutionBasisTest(unittest.TestCase):
    def test_current_moe_projections_leave_the_expected_cedict_targets(self) -> None:
        adapter = load_adapter()
        unresolved, accepted, _, _, candidate_count = adapter.unresolved_after_moe(
            CANDIDATES,
            CONCISED,
            REVISED,
        )

        self.assertEqual(candidate_count, active_catalog_size())
        self.assertEqual(len(accepted), active_concised_count() + active_revised_count())
        # Unresolved is a distinct-text set (not a row count): a heteronym
        # text can have several active rows, all sharing the same identity.
        self.assertEqual(
            len(unresolved),
            active_catalog_text_count() - active_concised_count() - active_revised_count(),
        )
        with CANDIDATES.open("r", encoding="utf-8-sig", newline="") as source:
            candidate_texts = {
                row["text"]
                for row in csv.DictReader(source)
                if row.get("status") != "excluded"
            }
        self.assertEqual(unresolved, sorted(candidate_texts - accepted))
        self.assertTrue(accepted.isdisjoint(unresolved))


if __name__ == "__main__":
    unittest.main()

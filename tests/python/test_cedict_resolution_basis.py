from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path
from types import ModuleType

ROOT = Path(__file__).resolve().parents[2]
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
    def test_current_moe_projections_leave_exactly_six_cedict_targets(self) -> None:
        adapter = load_adapter()
        unresolved, accepted, _, _, candidate_count = adapter.unresolved_after_moe(
            CANDIDATES,
            CONCISED,
            REVISED,
        )

        self.assertEqual(candidate_count, 80)
        self.assertEqual(len(accepted), 74)
        self.assertEqual(
            unresolved,
            ["台灣", "很好", "想要", "東西", "看到", "聽到"],
        )


if __name__ == "__main__":
    unittest.main()

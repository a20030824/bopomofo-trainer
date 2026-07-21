#!/usr/bin/env python3
"""Run the complete local-only NAER top-1,000 evidence projection."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PYTHON = sys.executable

NAER = ROOT / "data/external/naer/1141208/通用詞頻表.xlsx"
CONCISED = ROOT / "data/external/moe/concised/2014_20260626/dict_concised_2014_20260626.zip"
REVISED = ROOT / "data/external/moe/revised/2015_20260625/dict_revised_2015_20260625.zip"
CEDICT = ROOT / "data/external/cedict/2026-07-21/cedict_1_0_ts_utf-8_mdbg.zip"

CANDIDATES = ROOT / "data/lexicon/naer-1141208-top-1000-candidates.csv"
MANIFEST = ROOT / "data/lexicon/naer-1141208-top-1000-manifest.json"
CONCISED_OUTPUT = ROOT / "data/readings/moe-concised-2014_20260626-naer-top-1000.json"
REVISED_OUTPUT = ROOT / "data/readings/moe-revised-2015_20260625-naer-top-1000-fallback.json"
CEDICT_OUTPUT = ROOT / "data/identity/cedict-2026-07-21-naer-top-1000-hints.json"
COVERAGE_OUTPUT = ROOT / "data/lexicon/naer-1141208-top-1000-reading-coverage.json"


def run(*arguments: str) -> None:
    subprocess.run(arguments, cwd=ROOT, check=True)


def main() -> None:
    missing = [path for path in (NAER, CONCISED, REVISED, CEDICT) if not path.is_file()]
    if missing:
        formatted = "\n".join(f"- {path.relative_to(ROOT)}" for path in missing)
        raise SystemExit(f"missing local source files:\n{formatted}")

    run(
        PYTHON,
        "scripts/project-naer-lexicon-candidates.py",
        "--workbook",
        str(NAER),
        "--limit",
        "1000",
        "--output",
        str(CANDIDATES),
        "--manifest-output",
        str(MANIFEST),
    )
    run(
        PYTHON,
        "scripts/project-moe-concised-readings.py",
        "--archive",
        str(CONCISED),
        "--candidates",
        str(CANDIDATES),
        "--output",
        str(CONCISED_OUTPUT),
    )
    run(
        PYTHON,
        "scripts/project-moe-revised-readings.py",
        "--archive",
        str(REVISED),
        "--candidates",
        str(CANDIDATES),
        "--concised-projection",
        str(CONCISED_OUTPUT),
        "--output",
        str(REVISED_OUTPUT),
    )
    run(
        PYTHON,
        "scripts/project-cedict-identity-hints.py",
        "--dictionary",
        str(CEDICT),
        "--expected-sha256",
        "a20e3d9a5d5c3ae42d7539b9955cf2c545611f361e1be4515c560e04505eecf2",
        "--source-version",
        "2026-07-21T11:22:36Z",
        "--candidates",
        str(CANDIDATES),
        "--concised-projection",
        str(CONCISED_OUTPUT),
        "--revised-projection",
        str(REVISED_OUTPUT),
        "--output",
        str(CEDICT_OUTPUT),
    )
    run(
        PYTHON,
        "scripts/summarize-naer-reading-coverage.py",
        "--candidates",
        str(CANDIDATES),
        "--concised-projection",
        str(CONCISED_OUTPUT),
        "--revised-projection",
        str(REVISED_OUTPUT),
        "--cedict-projection",
        str(CEDICT_OUTPUT),
        "--output",
        str(COVERAGE_OUTPUT),
    )


if __name__ == "__main__":
    main()

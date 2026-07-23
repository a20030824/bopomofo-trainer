#!/usr/bin/env python3
"""Run candidate -> reading -> UD evidence -> activation in one command.

All outputs are disposable work products under an ignored generation
directory.  They remain together because the reviewed apply step needs the
CEDICT and UD evidence projections; source-control data directories contain
only active catalog inputs and human decisions.
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def run(*args: str) -> None:
    print(f"$ {' '.join(args)}")
    subprocess.run(args, cwd=ROOT, check=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--limit", type=int, default=10_000)
    parser.add_argument("--naer-source-id", default="1141208")
    parser.add_argument(
        "--naer-workbook",
        type=Path,
        default=ROOT / "data/external/naer/1141208/通用詞頻表.xlsx",
    )
    parser.add_argument(
        "--concised-archive",
        type=Path,
        default=ROOT / "data/external/moe/concised/2014_20260626/dict_concised_2014_20260626.zip",
    )
    parser.add_argument(
        "--revised-archive",
        type=Path,
        default=ROOT / "data/external/moe/revised/2015_20260625/dict_revised_2015_20260625.zip",
    )
    parser.add_argument(
        "--cedict-dictionary",
        type=Path,
        default=ROOT / "data/external/cedict/2026-07-21/cedict_1_0_ts_utf-8_mdbg.zip",
    )
    parser.add_argument(
        "--cedict-expected-sha256",
        default="a20e3d9a5d5c3ae42d7539b9955cf2c545611f361e1be4515c560e04505eecf2",
    )
    parser.add_argument("--cedict-source-version", default="2026-07-21T11:22:36Z")
    parser.add_argument(
        "--ud-source-dir",
        type=Path,
        default=ROOT / "data/external/ud/chinese-gsd/r2.18",
    )
    parser.add_argument("--ud-release-id", default="ud-chinese-gsd-r2.18")
    parser.add_argument(
        "--active-catalog",
        type=Path,
        default=ROOT / "data/source/words.sample.csv",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        help="disposable generation directory (default: data/generated/lexicon/<generation>)",
    )
    arguments = parser.parse_args()

    # The NAER source id prefixes the lexicon-tier files (they identify a
    # specific workbook snapshot). Per-authority projections instead prefix
    # with their own source version and only reference "naer-top-N" as the
    # candidate batch they were generated for -- matching the naming already
    # established for versioned lexical generations.
    tag = f"naer-{arguments.naer_source_id}-top-{arguments.limit}"
    output_dir = arguments.output_dir or ROOT / "data/generated/lexicon" / tag
    output_dir.mkdir(parents=True, exist_ok=True)

    candidates = output_dir / "candidates.csv"
    manifest = output_dir / "manifest.json"
    eligibility_report = output_dir / "eligibility-report.json"
    reading_coverage = output_dir / "reading-coverage.json"
    concised_output = output_dir / "moe-concised.json"
    revised_output = output_dir / "moe-revised-fallback.json"
    cedict_output = output_dir / "cedict-hints.json"
    ud_evidence = output_dir / "ud-evidence.json"
    ud_coverage = output_dir / "ud-coverage.json"
    activation_report = output_dir / "activation-report.json"
    activation_csv = output_dir / "activation-review.csv"

    run(
        sys.executable, "scripts/project-naer-lexicon-candidates.py",
        "--workbook", str(arguments.naer_workbook),
        "--limit", str(arguments.limit),
        "--invalid-row-policy", "report",
        "--output", str(candidates),
        "--manifest-output", str(manifest),
        "--report-output", str(eligibility_report),
    )
    run(
        sys.executable, "scripts/project-lexicon-reading-generation.py",
        "--candidates", str(candidates),
        "--candidate-manifest", str(manifest),
        "--concised-archive", str(arguments.concised_archive),
        "--concised-output", str(concised_output),
        "--revised-archive", str(arguments.revised_archive),
        "--revised-output", str(revised_output),
        "--cedict-dictionary", str(arguments.cedict_dictionary),
        "--cedict-expected-sha256", arguments.cedict_expected_sha256,
        "--cedict-source-version", arguments.cedict_source_version,
        "--cedict-output", str(cedict_output),
        "--coverage-output", str(reading_coverage),
    )
    run(
        sys.executable, "scripts/project-ud-grammar-evidence-generation.py",
        "--candidates", str(candidates),
        "--candidate-manifest", str(manifest),
        "--source-dir", str(arguments.ud_source_dir),
        "--evidence-output", str(ud_evidence),
        "--coverage-output", str(ud_coverage),
    )
    run(
        sys.executable, "scripts/project-lexicon-activation-generation.py",
        "--candidates", str(candidates),
        "--candidate-manifest", str(manifest),
        "--reading-coverage", str(reading_coverage),
        "--concised-projection", str(concised_output),
        "--revised-projection", str(revised_output),
        "--cedict-projection", str(cedict_output),
        "--active-catalog", str(arguments.active_catalog),
        "--ud-evidence", str(ud_evidence),
        "--ud-coverage", str(ud_coverage),
        "--output", str(activation_report),
        "--csv-output", str(activation_csv),
    )

    print(f"\ngeneration workspace: {output_dir.relative_to(ROOT)}")
    print(f"human review:         {activation_csv.relative_to(ROOT)}")


if __name__ == "__main__":
    main()

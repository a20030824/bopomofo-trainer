#!/usr/bin/env python3
"""Project aggregate UD Chinese GSD evidence for NAER top-1,000 candidates."""

from __future__ import annotations

import argparse
from pathlib import Path

from ud_grammar_evidence import (
    DEFAULT_CANDIDATES,
    DEFAULT_COVERAGE_OUTPUT,
    DEFAULT_EVIDENCE_OUTPUT,
    DEFAULT_SOURCE_DIR,
    project,
    write_json,
)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--candidates", type=Path, default=DEFAULT_CANDIDATES)
    parser.add_argument("--source-dir", type=Path, default=DEFAULT_SOURCE_DIR)
    parser.add_argument("--evidence-output", type=Path, default=DEFAULT_EVIDENCE_OUTPUT)
    parser.add_argument("--coverage-output", type=Path, default=DEFAULT_COVERAGE_OUTPUT)
    arguments = parser.parse_args()
    evidence, coverage = project(arguments.candidates, arguments.source_dir)
    write_json(arguments.evidence_output, evidence)
    write_json(arguments.coverage_output, coverage)
    print(
        f"observed {coverage['observedCandidateCount']} of "
        f"{coverage['candidateCount']} candidates in "
        f"{coverage['matchedOccurrenceCount']} token matches; "
        f"{coverage['unseenCandidateCount']} unseen; "
        f"{coverage['reviewCandidateCount']} queued for syntax review; "
        f"digest {coverage['determinismDigest']}"
    )


if __name__ == "__main__":
    main()

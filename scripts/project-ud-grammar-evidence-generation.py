#!/usr/bin/env python3
"""Project UD Chinese GSD evidence for a manifest-linked candidate generation."""

from __future__ import annotations

import argparse
from pathlib import Path

from ud_grammar_evidence import DEFAULT_SOURCE_DIR, write_json
from ud_grammar_evidence.generation import project_generation


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--candidates", required=True, type=Path)
    parser.add_argument("--candidate-manifest", required=True, type=Path)
    parser.add_argument("--source-dir", type=Path, default=DEFAULT_SOURCE_DIR)
    parser.add_argument("--evidence-output", required=True, type=Path)
    parser.add_argument("--coverage-output", required=True, type=Path)
    arguments = parser.parse_args()

    evidence, coverage = project_generation(
        arguments.candidates,
        arguments.candidate_manifest,
        arguments.source_dir,
    )
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

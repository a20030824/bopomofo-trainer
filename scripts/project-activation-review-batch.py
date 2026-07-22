#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path

from activation_review_batch import (
    DEFAULT_ACTIVE_CATALOG,
    DEFAULT_BATCH_OUTPUT,
    DEFAULT_CANDIDATES,
    DEFAULT_CEDICT,
    DEFAULT_CONCISED,
    DEFAULT_READING_COVERAGE,
    DEFAULT_REPORT_OUTPUT,
    DEFAULT_REVISED,
    DEFAULT_UD_COVERAGE,
    DEFAULT_UD_EVIDENCE,
    build,
    write_outputs,
)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--candidates", type=Path, default=DEFAULT_CANDIDATES)
    parser.add_argument("--reading-coverage", type=Path, default=DEFAULT_READING_COVERAGE)
    parser.add_argument("--concised", type=Path, default=DEFAULT_CONCISED)
    parser.add_argument("--revised", type=Path, default=DEFAULT_REVISED)
    parser.add_argument("--cedict", type=Path, default=DEFAULT_CEDICT)
    parser.add_argument("--ud-evidence", type=Path, default=DEFAULT_UD_EVIDENCE)
    parser.add_argument("--ud-coverage", type=Path, default=DEFAULT_UD_COVERAGE)
    parser.add_argument("--active-catalog", type=Path, default=DEFAULT_ACTIVE_CATALOG)
    parser.add_argument("--batch-output", type=Path, default=DEFAULT_BATCH_OUTPUT)
    parser.add_argument("--report-output", type=Path, default=DEFAULT_REPORT_OUTPUT)
    parser.add_argument("--batch-size", type=int, default=100)
    parser.add_argument("--minimum-occurrences", type=int, default=5)
    arguments = parser.parse_args()
    rendered_csv, report = build(
        candidate_path=arguments.candidates,
        reading_coverage_path=arguments.reading_coverage,
        concised_path=arguments.concised,
        revised_path=arguments.revised,
        cedict_path=arguments.cedict,
        ud_evidence_path=arguments.ud_evidence,
        ud_coverage_path=arguments.ud_coverage,
        active_catalog_path=arguments.active_catalog,
        batch_size=arguments.batch_size,
        minimum_occurrences=arguments.minimum_occurrences,
    )
    write_outputs(arguments.batch_output, arguments.report_output, rendered_csv, report)
    print(
        f"selected {report['selectedCount']} of {report['eligibleCandidateCount']} eligible candidates; "
        f"ranks {report['selectedRankRange']['first']}..{report['selectedRankRange']['last']}; "
        f"lanes {report['selectedReviewLaneCounts']}; digest {report['determinismDigest']}"
    )


if __name__ == "__main__":
    main()

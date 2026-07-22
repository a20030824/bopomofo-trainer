#!/usr/bin/env python3
"""Activate the auto-classified NAER catalog entries from batch 2.

Unlike batches 1's orders 1-100 (hand-reviewed), batch 2's 212 candidates
were classified by scripts/auto_classify_activation_batch.py: a fixed
statistical rule over UD evidence, not a per-word human decision. See that
script's docstring for the accepted, unreviewed error rate.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from catalog_activation import ROOT, BatchIdentity, run_activation
from validate_activation_review_decisions import (
    BATCH2_PATH,
    BATCH2_REPORT_PATH,
    BATCH2_REVIEW_SLICE,
    EXPECTED_BATCH2_REPORT_DIGEST,
)

DEFAULT_OUTPUT_REPORT = ROOT / "data/grammar/naer-reviewed-catalog-activation-4-report.json"

BATCH = BatchIdentity(
    slug="v4",
    order_range_label="batch 2 (auto-classified)",
    review_slice=BATCH2_REVIEW_SLICE,
    previous_report_path=ROOT / "data/grammar/naer-reviewed-catalog-activation-3-report.json",
)


def activate(output_report_path: Path = DEFAULT_OUTPUT_REPORT) -> dict[str, Any]:
    return run_activation(
        BATCH,
        output_report_path=output_report_path,
        batch_path=BATCH2_PATH,
        decision_report_path=BATCH2_REPORT_PATH,
        expected_batch_row_count=212,
        expected_batch_report_digest=EXPECTED_BATCH2_REPORT_DIGEST,
    )


def main() -> None:
    report = activate()
    counts = report["readingAuthorityCounts"]
    print(
        f"activated {report['activatedCount']} reviewed entries; "
        f"{report['activeCount']} active; readings {counts}; "
        f"digest {report['determinismDigest']}"
    )


if __name__ == "__main__":
    main()

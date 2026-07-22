#!/usr/bin/env python3
"""Activate the approved NAER catalog entries from review orders 51-100."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from catalog_activation import ROOT, BatchIdentity, run_activation
from validate_activation_review_decisions import THIRD_REVIEW_SLICE

DEFAULT_OUTPUT_REPORT = ROOT / "data/grammar/naer-reviewed-catalog-activation-3-report.json"

BATCH = BatchIdentity(
    slug="v3",
    order_range_label="orders 51–100",
    review_slice=THIRD_REVIEW_SLICE,
    previous_report_path=ROOT / "data/grammar/naer-reviewed-catalog-activation-2-report.json",
)


def activate(output_report_path: Path = DEFAULT_OUTPUT_REPORT) -> dict[str, Any]:
    return run_activation(BATCH, output_report_path=output_report_path)


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

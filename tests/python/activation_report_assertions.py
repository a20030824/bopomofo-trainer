from __future__ import annotations

from pathlib import Path
from typing import Any

import catalog_activation


def validate_historical_activation_report(
    batch: catalog_activation.BatchIdentity,
    report_path: Path,
) -> dict[str, Any]:
    """Validate an immutable activation snapshot without comparing later outputs.

    Activation reports describe the exact files emitted at their own catalog
    generation. Once later batches extend those mutable output paths, the old
    checksums remain historical evidence and must not be compared with the
    current working-tree bytes.
    """
    report = catalog_activation.load_json(report_path)
    if report.get("adapterVersion") != batch.adapter_version:
        raise ValueError("unexpected activation report adapter version")

    report_core = {
        key: value
        for key, value in report.items()
        if key not in {"adapterVersion", "determinismDigest", "policy"}
    }
    if report.get("determinismDigest") != catalog_activation.canonical_digest(
        report_core
    ):
        raise ValueError("activation report determinism digest mismatch")

    baseline_count, _ = catalog_activation.resolve_baseline_state(batch)
    expected_active_count = baseline_count + batch.review_slice.expected_approved
    if report.get("activeCount") != expected_active_count:
        raise ValueError("activation report active count mismatch")
    if len(report.get("activatedTexts", [])) != batch.review_slice.expected_approved:
        raise ValueError("activation report activated-text count mismatch")

    checksums = report.get("outputChecksumsSha256")
    if not isinstance(checksums, dict) or not checksums:
        raise ValueError("activation report output checksums are missing")
    if any(
        not isinstance(path, str)
        or not isinstance(digest, str)
        or len(digest) != 64
        for path, digest in checksums.items()
    ):
        raise ValueError("activation report output checksums are malformed")

    policy = report.get("policy")
    if not isinstance(policy, dict):
        raise ValueError("activation report policy is missing")
    if policy.get("grammarDecisionSource") != batch.grammar_decision_source:
        raise ValueError("activation report decision source mismatch")
    if policy.get("stageEligibilityChange") != "forbidden":
        raise ValueError("activation report stage policy mismatch")
    if policy.get("heldCandidateActivation") != "forbidden":
        raise ValueError("activation report held-candidate policy mismatch")
    if policy.get("externalBulkSourceAccess") != "forbidden":
        raise ValueError("activation report source-access policy mismatch")

    return report

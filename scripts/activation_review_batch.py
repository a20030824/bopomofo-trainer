from __future__ import annotations

import csv
import hashlib
import json
from collections import Counter
from pathlib import Path
from typing import Any

from activation_review_batch_common import (
    ADAPTER_VERSION,
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
    EXPECTED_ACTIVE_CATALOG_COUNT,
    EXPECTED_CANDIDATE_COUNT,
    EXPECTED_READING_COVERAGE_DIGEST,
    EXPECTED_READING_REVIEW_COUNT,
    EXPECTED_UD_COVERAGE_DIGEST,
    EXPECTED_UD_EVIDENCE_DIGEST,
    EXPECTED_UD_REVIEW_COUNT,
    DEFAULT_BATCH_SIZE,
    DEFAULT_MIN_OCCURRENCES,
    REVIEW_LANES,
    EXCLUSION_PRECEDENCE,
    CSV_FIELDS,
    build_reading_lookup,
    canonical_digest,
    canonical_text_sha256,
    load_active_catalog,
    load_candidates,
    load_json,
    load_ud,
)


def significant_upos(row: dict[str, Any], minimum_count: int, minimum_share: float) -> list[str]:
    occurrence_count = row.get("occurrenceCount")
    counts = row.get("uposCounts")
    if not isinstance(occurrence_count, int) or occurrence_count <= 0 or not isinstance(counts, dict):
        return []
    result: list[str] = []
    for tag, count in counts.items():
        if isinstance(tag, str) and isinstance(count, int):
            if count >= minimum_count and count / occurrence_count >= minimum_share:
                result.append(tag)
    return sorted(result)


def compact_counts(value: Any) -> str:
    if not isinstance(value, dict):
        return ""
    pairs = [f"{key}={value[key]}" for key in sorted(value) if isinstance(value[key], int)]
    return ";".join(pairs)


def select_batch(
    *,
    candidates: list[dict[str, Any]],
    active_catalog: set[str],
    reading_lookup: dict[str, dict[str, str]],
    reading_unresolved: set[str],
    ud_rows: dict[str, dict[str, Any]],
    ud_review: set[str],
    significant_min_count: int,
    significant_min_share: float,
    batch_size: int,
    minimum_occurrences: int,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    if batch_size <= 0 or minimum_occurrences <= 0:
        raise ValueError("batch size and minimum occurrences must be positive")

    eligible: list[dict[str, Any]] = []
    exclusion_counts: Counter[str] = Counter()
    eligible_lane_counts: Counter[str] = Counter()
    for candidate in candidates:
        text = candidate["text"]
        ud = ud_rows[text]
        reason: str | None = None
        if text in active_catalog:
            reason = "active-catalog"
        elif text in reading_unresolved:
            reason = "reading-review-required"
        elif text in ud_review:
            reason = "ud-syntax-review-required"
        elif ud.get("occurrenceCount", 0) < minimum_occurrences:
            reason = "insufficient-ud-occurrences"
        else:
            dominant = ud.get("dominantUpos")
            significant = significant_upos(ud, significant_min_count, significant_min_share)
            if (
                not isinstance(dominant, list)
                or len(dominant) != 1
                or len(significant) != 1
                or dominant[0] != significant[0]
            ):
                reason = "unstable-dominant-upos"
            elif dominant[0] not in REVIEW_LANES:
                reason = "unsupported-template-evidence"
        if reason is not None:
            exclusion_counts[reason] += 1
            continue

        dominant_upos = ud["dominantUpos"][0]
        lane = REVIEW_LANES[dominant_upos]
        reading = reading_lookup[text]
        verb_evidence = ud.get("verbEvidence")
        verb_object_frame = ""
        if isinstance(verb_evidence, dict):
            value = verb_evidence.get("observedObjectFrame")
            if isinstance(value, str):
                verb_object_frame = value
        eligible_lane_counts[lane] += 1
        eligible.append({
            "generalRank": candidate["generalRank"],
            "text": text,
            "readingAuthority": reading["authority"],
            "readingEvidenceType": reading["evidenceType"],
            "readingEvidence": reading["evidence"],
            "reviewLane": lane,
            "occurrenceCount": ud["occurrenceCount"],
            "dominantUpos": dominant_upos,
            "uposCounts": ud.get("uposCounts", {}),
            "dependencyRelationCounts": ud.get("dependencyRelationCounts", {}),
            "rootCount": ud.get("rootCount", 0),
            "verbObjectFrame": verb_object_frame,
        })

    if sum(exclusion_counts.values()) + len(eligible) != len(candidates):
        raise AssertionError("screening did not partition candidates")
    if len(eligible) < batch_size:
        raise ValueError(f"only {len(eligible)} candidates are eligible for a batch of {batch_size}")

    selected = eligible[:batch_size]
    csv_rows = []
    for order, row in enumerate(selected, start=1):
        csv_rows.append({
            "batch_order": order,
            "general_rank": row["generalRank"],
            "text": row["text"],
            "reading_authority": row["readingAuthority"],
            "reading_evidence_type": row["readingEvidenceType"],
            "reading_evidence": row["readingEvidence"],
            "review_lane": row["reviewLane"],
            "occurrence_count": row["occurrenceCount"],
            "dominant_upos": row["dominantUpos"],
            "upos_counts": compact_counts(row["uposCounts"]),
            "dependency_relation_counts": compact_counts(row["dependencyRelationCounts"]),
            "root_count": row["rootCount"],
            "verb_object_frame": row["verbObjectFrame"],
            "review_status": "pending",
        })

    selected_lane_counts = Counter(row["reviewLane"] for row in selected)
    selected_authority_counts = Counter(row["readingAuthority"] for row in selected)
    summary = {
        "candidateCount": len(candidates),
        "screeningReasonPrecedence": list(EXCLUSION_PRECEDENCE),
        "exclusionCounts": {reason: exclusion_counts[reason] for reason in EXCLUSION_PRECEDENCE},
        "eligibleCandidateCount": len(eligible),
        "eligibleReviewLaneCounts": dict(sorted(eligible_lane_counts.items())),
        "selectedCount": len(selected),
        "selectedRankRange": {
            "first": selected[0]["generalRank"],
            "last": selected[-1]["generalRank"],
        },
        "selectedReviewLaneCounts": dict(sorted(selected_lane_counts.items())),
        "selectedReadingAuthorityCounts": dict(sorted(selected_authority_counts.items())),
        "selectedTexts": [row["text"] for row in selected],
    }
    return csv_rows, summary


def csv_bytes(rows: list[dict[str, Any]]) -> bytes:
    from io import StringIO

    buffer = StringIO(newline="")
    writer = csv.DictWriter(buffer, fieldnames=CSV_FIELDS, lineterminator="\n")
    writer.writeheader()
    writer.writerows(rows)
    return buffer.getvalue().encode("utf-8")


def build(
    *,
    candidate_path: Path = DEFAULT_CANDIDATES,
    reading_coverage_path: Path = DEFAULT_READING_COVERAGE,
    concised_path: Path = DEFAULT_CONCISED,
    revised_path: Path = DEFAULT_REVISED,
    cedict_path: Path = DEFAULT_CEDICT,
    ud_evidence_path: Path = DEFAULT_UD_EVIDENCE,
    ud_coverage_path: Path = DEFAULT_UD_COVERAGE,
    active_catalog_path: Path = DEFAULT_ACTIVE_CATALOG,
    expected_candidate_count: int = EXPECTED_CANDIDATE_COUNT,
    expected_active_catalog_count: int = EXPECTED_ACTIVE_CATALOG_COUNT,
    expected_reading_digest: str = EXPECTED_READING_COVERAGE_DIGEST,
    expected_reading_review_count: int = EXPECTED_READING_REVIEW_COUNT,
    expected_ud_evidence_digest: str = EXPECTED_UD_EVIDENCE_DIGEST,
    expected_ud_coverage_digest: str = EXPECTED_UD_COVERAGE_DIGEST,
    expected_ud_review_count: int = EXPECTED_UD_REVIEW_COUNT,
    batch_size: int = DEFAULT_BATCH_SIZE,
    minimum_occurrences: int = DEFAULT_MIN_OCCURRENCES,
) -> tuple[bytes, dict[str, Any]]:
    candidates = load_candidates(candidate_path, expected_candidate_count)
    candidate_set = {row["text"] for row in candidates}
    active_catalog = load_active_catalog(active_catalog_path, expected_active_catalog_count)
    reading_lookup, reading_unresolved = build_reading_lookup(
        candidate_set,
        load_json(reading_coverage_path),
        load_json(concised_path),
        load_json(revised_path),
        load_json(cedict_path),
        expected_digest=expected_reading_digest,
        expected_review_count=expected_reading_review_count,
    )
    ud_rows, ud_review, significant_min_count, significant_min_share = load_ud(
        candidate_set,
        load_json(ud_evidence_path),
        load_json(ud_coverage_path),
        expected_evidence_digest=expected_ud_evidence_digest,
        expected_coverage_digest=expected_ud_coverage_digest,
        expected_review_count=expected_ud_review_count,
    )
    rows, summary = select_batch(
        candidates=candidates,
        active_catalog=active_catalog,
        reading_lookup=reading_lookup,
        reading_unresolved=reading_unresolved,
        ud_rows=ud_rows,
        ud_review=ud_review,
        significant_min_count=significant_min_count,
        significant_min_share=significant_min_share,
        batch_size=batch_size,
        minimum_occurrences=minimum_occurrences,
    )
    rendered_csv = csv_bytes(rows)
    core = {
        "policy": {
            "batchSize": batch_size,
            "minimumUdExactFormOccurrences": minimum_occurrences,
            "selectionOrder": "ascending-naer-general-rank",
            "laneQuota": "none",
            "automaticProductGrammarRoleAssignment": "forbidden",
            "automaticPredicateFrameAssignment": "forbidden",
            "reviewLaneMapping": dict(REVIEW_LANES),
        },
        "inputLocks": {
            "candidatesCanonicalSha256": canonical_text_sha256(candidate_path),
            "readingCoverageDigest": expected_reading_digest,
            "udEvidenceDigest": expected_ud_evidence_digest,
            "udCoverageDigest": expected_ud_coverage_digest,
            "activeCatalogCanonicalSha256": canonical_text_sha256(active_catalog_path),
        },
        **summary,
        "batchCsvSha256": hashlib.sha256(rendered_csv).hexdigest(),
    }
    report = {
        "adapterVersion": ADAPTER_VERSION,
        **core,
        "determinismDigest": canonical_digest(core),
    }
    return rendered_csv, report


def write_outputs(csv_path: Path, report_path: Path, rendered_csv: bytes, report: dict[str, Any]) -> None:
    csv_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    csv_path.write_bytes(rendered_csv)
    report_path.write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
        newline="\n",
    )

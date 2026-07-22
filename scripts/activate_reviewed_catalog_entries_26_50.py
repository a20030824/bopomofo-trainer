#!/usr/bin/env python3
"""Activate the approved NAER catalog entries from review orders 26–50."""

from __future__ import annotations

import hashlib
from collections import Counter
from pathlib import Path
from typing import Any, Mapping, Sequence

from activate_reviewed_catalog_entries import (
    GRAMMAR_FIELDS,
    PROVENANCE_FIELDS,
    ROOT,
    TOP_CANDIDATE_FIELDS,
    WORDS_FIELDS,
    atomic_write_lf,
    canonical_digest,
    csv_text,
    ensure_unique,
    json_text,
    load_candidate_commonness,
    load_csv,
    load_json,
    projection_rows,
    sha256_text,
)
from validate_activation_review_decisions import (
    DECISION_FIELDS,
    validate_second_files,
)

DEFAULT_BATCH = ROOT / "data/grammar/naer-top-1000-activation-review-batch-1.csv"
DEFAULT_DECISION_REPORT = (
    ROOT / "data/grammar/naer-top-1000-activation-review-batch-1-report.json"
)
DEFAULT_DECISIONS = (
    ROOT / "data/grammar/naer-activation-review-batch-1-decisions-26-50.csv"
)
DEFAULT_WORDS = ROOT / "data/source/words.sample.csv"
DEFAULT_GRAMMAR = ROOT / "data/source/grammar.sample.csv"
DEFAULT_PROVENANCE = ROOT / "data/provenance.csv"
DEFAULT_TOP_CANDIDATES = ROOT / "data/lexicon/naer-1141208-top-1000-candidates.csv"
DEFAULT_TOP_CONCISED = (
    ROOT / "data/readings/moe-concised-2014_20260626-naer-top-1000.json"
)
DEFAULT_TOP_REVISED = (
    ROOT / "data/readings/moe-revised-2015_20260625-naer-top-1000-fallback.json"
)
DEFAULT_ACTIVE_COMMONNESS = (
    ROOT / "data/commonness/naer-1141208-active-catalog-rows.json"
)
DEFAULT_ACTIVE_CONCISED = (
    ROOT / "data/readings/moe-concised-2014_20260626-active-catalog.json"
)
DEFAULT_ACTIVE_REVISED = (
    ROOT / "data/readings/moe-revised-2015_20260625-active-catalog-fallback.json"
)
DEFAULT_ACTIVE_CEDICT = ROOT / "data/identity/cedict-active-catalog-hints.json"
DEFAULT_OUTPUT_REPORT = (
    ROOT / "data/grammar/naer-reviewed-catalog-activation-2-report.json"
)

ADAPTER_VERSION = "naer-reviewed-catalog-activation-v2"
ACTIVATION_PROVENANCE_ID = "local:activation-review-v2"
ACTIVATION_PROVENANCE_ROW = {
    "id": ACTIVATION_PROVENANCE_ID,
    "kind": "manual",
    "title": "Bopomofo Trainer NAER activation review v2",
    "license": "not-applicable",
    "notes": (
        "Reviewed rank-ordered catalog activation decisions for batch orders 26–50; "
        "preserves committed reading and grammar evidence and excludes held candidates."
    ),
}

BASELINE_ACTIVE_COUNT = 60
TARGET_ACTIVE_COUNT = 80
EXPECTED_APPROVED_TEXTS = [
    "重要",
    "美國",
    "中國",
    "政府",
    "社會",
    "世界",
    "活動",
    "公司",
    "民眾",
    "不同",
    "關係",
    "能夠",
    "不能",
    "事情",
    "最後",
    "國家",
    "方式",
    "必須",
    "走",
    "環境",
]
EXPECTED_READING_COUNTS = {
    "moe-concised": 70,
    "moe-revised": 4,
    "cedict": 4,
    "manual": 2,
}
EXPECTED_NEW_READING_AUTHORITY_COUNTS = {
    "moe-concised": 18,
    "moe-revised": 2,
}


def activation_state(
    rows: Sequence[Mapping[str, Any]],
    *,
    key: str,
    approved_texts: Sequence[str],
    baseline_count: int = BASELINE_ACTIVE_COUNT,
    target_count: int = TARGET_ACTIVE_COUNT,
    label: str,
) -> str:
    identities = [str(row.get(key, "")) for row in rows]
    if len(set(identities)) != len(identities) or any(not value for value in identities):
        raise ValueError(f"{label} has missing or duplicate identities")
    identity_set = set(identities)
    present = [text for text in approved_texts if text in identity_set]
    if not present:
        if len(rows) != baseline_count:
            raise ValueError(
                f"{label} baseline must contain {baseline_count} rows, found {len(rows)}"
            )
        return "baseline"
    if present == list(approved_texts):
        if len(rows) != target_count:
            raise ValueError(
                f"{label} activated state must contain {target_count} rows, found {len(rows)}"
            )
        return "activated"
    raise ValueError(f"{label} contains a partial activation: {present}")


def load_review_decisions(
    batch_path: Path,
    decision_report_path: Path,
    decisions_path: Path,
) -> tuple[list[dict[str, str]], list[dict[str, str]], dict[str, Any]]:
    validation = validate_second_files(batch_path, decision_report_path, decisions_path)
    decisions = load_csv(decisions_path, DECISION_FIELDS)
    approved = [
        row for row in decisions if row["decision"] == "approved-existing-schema"
    ]
    approved_texts = [row["text"] for row in approved]
    if approved_texts != EXPECTED_APPROVED_TEXTS:
        raise ValueError(f"approved activation identities drift: {approved_texts}")
    authority_counts = Counter(row["reading_authority"] for row in approved)
    if dict(sorted(authority_counts.items())) != EXPECTED_NEW_READING_AUTHORITY_COUNTS:
        raise ValueError(f"approved reading authority counts drift: {authority_counts}")
    if any(row["reading_evidence_type"] != "trainer-bopomofo" for row in approved):
        raise ValueError("approved activation readings must be trainer Bopomofo")
    held = [row for row in decisions if row["decision"] != "approved-existing-schema"]
    return approved, held, validation


def expected_word_row(decision: Mapping[str, str]) -> dict[str, str]:
    return {
        "text": decision["text"],
        "reading": decision["reading_evidence"],
        "frequency_band": "1",
        "tags": "general",
        "status": "reviewed",
        "provenance_ids": ACTIVATION_PROVENANCE_ID,
    }


def expected_grammar_row(decision: Mapping[str, str]) -> dict[str, str]:
    return {
        "text": decision["text"],
        "reading": decision["reading_evidence"],
        "roles": decision["roles"],
        "predicate_frame": decision["predicate_frame"],
        "standalone_kind": decision["standalone_kind"],
        "provenance_ids": ACTIVATION_PROVENANCE_ID,
    }


def activate_csv_rows(
    rows: list[dict[str, str]],
    approved: Sequence[Mapping[str, str]],
    *,
    fields: Sequence[str],
    row_factory,
    label: str,
) -> list[dict[str, str]]:
    approved_texts = [row["text"] for row in approved]
    activation_state(rows, key="text", approved_texts=approved_texts, label=label)
    approved_set = set(approved_texts)
    result = [
        *(row for row in rows if row["text"] not in approved_set),
        *(row_factory(row) for row in approved),
    ]
    if len(result) != TARGET_ACTIVE_COUNT:
        raise ValueError(f"{label} did not produce {TARGET_ACTIVE_COUNT} rows")
    ensure_unique(result, "text", label)
    if any(set(row) != set(fields) for row in result):
        raise ValueError(f"{label} contains unexpected fields")
    return result


def activate_provenance(rows: list[dict[str, str]]) -> list[dict[str, str]]:
    ensure_unique(rows, "id", "provenance")
    existing = next(
        (row for row in rows if row["id"] == ACTIVATION_PROVENANCE_ID),
        None,
    )
    if existing is not None:
        if existing != ACTIVATION_PROVENANCE_ROW:
            raise ValueError("activation provenance row differs from the locked definition")
        return rows
    return [*rows, dict(ACTIVATION_PROVENANCE_ROW)]


def activate_commonness(
    payload: dict[str, Any],
    candidate_rows: Mapping[str, dict[str, Any]],
    approved_texts: Sequence[str],
    active_texts: set[str],
) -> dict[str, Any]:
    rows = payload.get("rows")
    if not isinstance(rows, list) or any(not isinstance(row, dict) for row in rows):
        raise ValueError("active commonness projection has malformed rows")
    activation_state(
        rows,
        key="lexicalText",
        approved_texts=approved_texts,
        label="active commonness projection",
    )
    approved_set = set(approved_texts)
    activated = []
    for text in approved_texts:
        row = candidate_rows.get(text)
        if row is None:
            raise ValueError(f"missing top-1,000 NAER commonness row: {text}")
        activated.append(dict(row))
    final_rows = sorted(
        [
            *(row for row in rows if row.get("lexicalText") not in approved_set),
            *activated,
        ],
        key=lambda row: (int(row["generalRank"]), str(row["lexicalText"])),
    )
    if {str(row["lexicalText"]) for row in final_rows} != active_texts:
        raise ValueError("active commonness identities do not equal active catalog identities")
    catalog = payload.get("catalog")
    diagnostics = payload.get("diagnostics")
    if not isinstance(catalog, dict) or not isinstance(diagnostics, dict):
        raise ValueError("active commonness metadata is malformed")
    source_row_count = diagnostics.get("sourceRowCount")
    if not isinstance(source_row_count, int):
        raise ValueError("active commonness sourceRowCount is missing")
    payload["catalog"] = {
        **catalog,
        "entryCount": TARGET_ACTIVE_COUNT,
        "normalizedTextCount": TARGET_ACTIVE_COUNT,
    }
    payload["rows"] = final_rows
    payload["diagnostics"] = {
        **diagnostics,
        "catalogScopedSourceRowCount": TARGET_ACTIVE_COUNT,
        "unmatchedCatalogTexts": [],
        "ambiguousCatalogTexts": [],
        "omittedNonCatalogSourceRowCount": source_row_count - TARGET_ACTIVE_COUNT,
    }
    return payload


def activate_concised(
    active_payload: dict[str, Any],
    top_payload: Mapping[str, Any],
    approved: Sequence[Mapping[str, str]],
) -> dict[str, Any]:
    active_rows = projection_rows(active_payload, "active Concised projection")
    approved_rows = [row for row in approved if row["reading_authority"] == "moe-concised"]
    approved_texts = [row["text"] for row in approved_rows]
    activation_state(
        active_rows,
        key="lookupText",
        approved_texts=approved_texts,
        baseline_count=52,
        target_count=70,
        label="active Concised accepted rows",
    )
    top_rows = {
        str(row["lookupText"]): row
        for row in projection_rows(top_payload, "top-1,000 Concised projection")
    }
    approved_set = set(approved_texts)
    activated = []
    for decision in approved_rows:
        text = decision["text"]
        row = top_rows.get(text)
        if row is None:
            raise ValueError(f"missing top-1,000 Concised row: {text}")
        if row.get("trainerReading") != decision["reading_evidence"]:
            raise ValueError(f"Concised reading no longer matches review decision: {text}")
        activated.append(dict(row))
    final_rows = sorted(
        [
            *(row for row in active_rows if str(row["lookupText"]) not in approved_set),
            *activated,
        ],
        key=lambda row: str(row["lookupText"]),
    )
    if len(final_rows) != EXPECTED_READING_COUNTS["moe-concised"]:
        raise ValueError("unexpected activated Concised row count")
    candidate_set = active_payload.get("candidateSet")
    diagnostics = active_payload.get("diagnostics")
    if not isinstance(candidate_set, dict) or not isinstance(diagnostics, dict):
        raise ValueError("active Concised metadata is malformed")
    source_row_count = diagnostics.get("sourceRowCount")
    previous_scoped = diagnostics.get("candidateScopedSourceRowCount")
    previous_accepted = diagnostics.get("acceptedCandidateCount")
    if not all(isinstance(value, int) for value in (
        source_row_count,
        previous_scoped,
        previous_accepted,
    )):
        raise ValueError("active Concised diagnostics are missing counts")
    unresolved_delta = int(previous_scoped) - int(previous_accepted)
    scoped_count = len(final_rows) + unresolved_delta
    active_payload["candidateSet"] = {
        **candidate_set,
        "entryCount": TARGET_ACTIVE_COUNT,
        "normalizedTextCount": TARGET_ACTIVE_COUNT,
    }
    active_payload["rows"] = final_rows
    active_payload["diagnostics"] = {
        **diagnostics,
        "candidateScopedSourceRowCount": scoped_count,
        "acceptedCandidateCount": len(final_rows),
        "omittedNonCandidateSourceRowCount": int(source_row_count) - scoped_count,
    }
    return active_payload


def activate_revised(
    active_payload: dict[str, Any],
    top_payload: Mapping[str, Any],
    approved: Sequence[Mapping[str, str]],
    *,
    active_texts: set[str],
    concised_texts: set[str],
    concised_sha256: str,
) -> dict[str, Any]:
    active_rows = projection_rows(active_payload, "active Revised projection")
    approved_rows = [row for row in approved if row["reading_authority"] == "moe-revised"]
    approved_texts = [row["text"] for row in approved_rows]
    activation_state(
        active_rows,
        key="lookupText",
        approved_texts=approved_texts,
        baseline_count=2,
        target_count=4,
        label="active Revised accepted rows",
    )
    top_rows = {
        str(row["lookupText"]): row
        for row in projection_rows(top_payload, "top-1,000 Revised projection")
    }
    approved_set = set(approved_texts)
    activated = []
    for decision in approved_rows:
        text = decision["text"]
        row = top_rows.get(text)
        if row is None:
            raise ValueError(f"missing top-1,000 Revised row: {text}")
        if row.get("trainerReading") != decision["reading_evidence"]:
            raise ValueError(f"Revised reading no longer matches review decision: {text}")
        activated.append(dict(row))
    final_rows = sorted(
        [
            *(row for row in active_rows if str(row["lookupText"]) not in approved_set),
            *activated,
        ],
        key=lambda row: str(row["lookupText"]),
    )
    if len(final_rows) != EXPECTED_READING_COUNTS["moe-revised"]:
        raise ValueError("unexpected activated Revised row count")
    fallback_basis = active_payload.get("fallbackBasis")
    diagnostics = active_payload.get("diagnostics")
    if not isinstance(fallback_basis, dict) or not isinstance(diagnostics, dict):
        raise ValueError("active Revised metadata is malformed")
    expected_fallback = active_texts - concised_texts
    final_texts = {str(row["lookupText"]) for row in final_rows}
    if not final_texts.issubset(expected_fallback):
        raise ValueError("Revised accepted rows are outside the fallback target set")
    source_row_count = diagnostics.get("sourceRowCount")
    previous_scoped = diagnostics.get("candidateScopedSourceRowCount")
    previous_accepted = diagnostics.get("acceptedFallbackCount")
    if not all(isinstance(value, int) for value in (
        source_row_count,
        previous_scoped,
        previous_accepted,
    )):
        raise ValueError("active Revised diagnostics are missing counts")
    unresolved_delta = int(previous_scoped) - int(previous_accepted)
    scoped_count = len(final_rows) + unresolved_delta
    active_payload["fallbackBasis"] = {
        **fallback_basis,
        "concisedProjectionChecksumSha256": concised_sha256,
        "concisedAcceptedCandidateCount": len(concised_texts),
        "fallbackCandidateCount": len(expected_fallback),
        "fallbackCandidateTexts": sorted(expected_fallback),
    }
    active_payload["rows"] = final_rows
    active_payload["diagnostics"] = {
        **diagnostics,
        "candidateScopedSourceRowCount": scoped_count,
        "acceptedFallbackCount": len(final_rows),
        "unmatchedFallbackTexts": sorted(
            set(diagnostics.get("unmatchedFallbackTexts", [])) & expected_fallback
        ),
        "multipleReadingTexts": sorted(
            set(diagnostics.get("multipleReadingTexts", [])) & expected_fallback
        ),
        "omittedNonFallbackSourceRowCount": int(source_row_count) - scoped_count,
    }
    return active_payload


def activate_cedict(
    payload: dict[str, Any],
    *,
    active_texts: set[str],
    moe_accepted_texts: set[str],
) -> dict[str, Any]:
    basis = payload.get("resolutionBasis")
    if not isinstance(basis, dict):
        raise ValueError("active CEDICT resolutionBasis is malformed")
    expected_targets = active_texts - moe_accepted_texts
    rows = payload.get("rows")
    if not isinstance(rows, list):
        raise ValueError("active CEDICT rows are malformed")
    resolved_texts = {
        str(row.get("lookupText", ""))
        for row in rows
        if isinstance(row, dict)
    }
    if not resolved_texts.issubset(expected_targets):
        raise ValueError("CEDICT accepted rows are outside the target set")
    payload["resolutionBasis"] = {
        **basis,
        "candidateEntryCount": TARGET_ACTIVE_COUNT,
        "moeAcceptedCandidateCount": len(moe_accepted_texts),
        "cedictTargetCount": len(expected_targets),
        "cedictTargetTexts": sorted(expected_targets),
    }
    return payload


def validate_held_absence(
    active_texts: set[str],
    held: Sequence[Mapping[str, str]],
) -> None:
    leaked = sorted(row["text"] for row in held if row["text"] in active_texts)
    if leaked:
        raise ValueError(f"held activation decisions entered the active catalog: {leaked}")


def activate(
    *,
    batch_path: Path = DEFAULT_BATCH,
    decision_report_path: Path = DEFAULT_DECISION_REPORT,
    decisions_path: Path = DEFAULT_DECISIONS,
    words_path: Path = DEFAULT_WORDS,
    grammar_path: Path = DEFAULT_GRAMMAR,
    provenance_path: Path = DEFAULT_PROVENANCE,
    top_candidates_path: Path = DEFAULT_TOP_CANDIDATES,
    top_concised_path: Path = DEFAULT_TOP_CONCISED,
    top_revised_path: Path = DEFAULT_TOP_REVISED,
    commonness_path: Path = DEFAULT_ACTIVE_COMMONNESS,
    concised_path: Path = DEFAULT_ACTIVE_CONCISED,
    revised_path: Path = DEFAULT_ACTIVE_REVISED,
    cedict_path: Path = DEFAULT_ACTIVE_CEDICT,
    output_report_path: Path = DEFAULT_OUTPUT_REPORT,
) -> dict[str, Any]:
    approved, held, decision_validation = load_review_decisions(
        batch_path,
        decision_report_path,
        decisions_path,
    )
    approved_texts = [row["text"] for row in approved]
    words = activate_csv_rows(
        load_csv(words_path, WORDS_FIELDS),
        approved,
        fields=WORDS_FIELDS,
        row_factory=expected_word_row,
        label="active lexical catalog",
    )
    grammar = activate_csv_rows(
        load_csv(grammar_path, GRAMMAR_FIELDS),
        approved,
        fields=GRAMMAR_FIELDS,
        row_factory=expected_grammar_row,
        label="active grammar sidecar",
    )
    provenance = activate_provenance(load_csv(provenance_path, PROVENANCE_FIELDS))
    active_texts = {row["text"] for row in words}
    if {row["text"] for row in grammar} != active_texts:
        raise ValueError("active grammar identities do not equal active lexical identities")
    validate_held_absence(active_texts, held)
    commonness = activate_commonness(
        load_json(commonness_path),
        load_candidate_commonness(top_candidates_path),
        approved_texts,
        active_texts,
    )
    concised = activate_concised(
        load_json(concised_path),
        load_json(top_concised_path),
        approved,
    )
    words_output = csv_text(words, WORDS_FIELDS)
    grammar_output = csv_text(grammar, GRAMMAR_FIELDS)
    provenance_output = csv_text(provenance, PROVENANCE_FIELDS)
    commonness_output = json_text(commonness)
    concised_output = json_text(concised)
    concised_sha256 = sha256_text(concised_output)
    concised_texts = {
        str(row["lookupText"])
        for row in projection_rows(concised, "activated Concised projection")
    }
    revised = activate_revised(
        load_json(revised_path),
        load_json(top_revised_path),
        approved,
        active_texts=active_texts,
        concised_texts=concised_texts,
        concised_sha256=concised_sha256,
    )
    revised_texts = {
        str(row["lookupText"])
        for row in projection_rows(revised, "activated Revised projection")
    }
    cedict = activate_cedict(
        load_json(cedict_path),
        active_texts=active_texts,
        moe_accepted_texts=concised_texts | revised_texts,
    )
    revised_output = json_text(revised)
    cedict_output = json_text(cedict)
    output_texts = {
        words_path: words_output,
        grammar_path: grammar_output,
        provenance_path: provenance_output,
        commonness_path: commonness_output,
        concised_path: concised_output,
        revised_path: revised_output,
        cedict_path: cedict_output,
    }
    output_checksums = {
        path.relative_to(ROOT).as_posix(): sha256_text(text)
        for path, text in output_texts.items()
    }
    report_core = {
        "decisionDigest": decision_validation["determinismDigest"],
        "baselineActiveCount": BASELINE_ACTIVE_COUNT,
        "activeCount": TARGET_ACTIVE_COUNT,
        "activatedCount": len(approved_texts),
        "activatedTexts": approved_texts,
        "readingAuthorityCounts": EXPECTED_READING_COUNTS,
        "grammarAnnotationCount": len(grammar),
        "commonnessRowCount": len(commonness["rows"]),
        "heldDecisionCount": len(held),
        "outputChecksumsSha256": dict(sorted(output_checksums.items())),
    }
    report = {
        "adapterVersion": ADAPTER_VERSION,
        **report_core,
        "determinismDigest": canonical_digest(report_core),
        "policy": {
            "stageEligibilityChange": "forbidden",
            "heldCandidateActivation": "forbidden",
            "grammarDecisionSource": (
                "data/grammar/naer-activation-review-batch-1-decisions-26-50.csv"
            ),
            "externalBulkSourceAccess": "forbidden",
        },
    }
    for path, text in output_texts.items():
        atomic_write_lf(path, text)
    atomic_write_lf(output_report_path, json_text(report))
    return report


def validate_committed_activation(
    report_path: Path = DEFAULT_OUTPUT_REPORT,
) -> dict[str, Any]:
    report = load_json(report_path)
    if report.get("adapterVersion") != ADAPTER_VERSION:
        raise ValueError("unexpected activation report adapter version")
    report_core = {
        key: value
        for key, value in report.items()
        if key not in {"adapterVersion", "determinismDigest", "policy"}
    }
    if report.get("determinismDigest") != canonical_digest(report_core):
        raise ValueError("activation report determinism digest mismatch")
    if report.get("activeCount") != TARGET_ACTIVE_COUNT:
        raise ValueError("activation report active count mismatch")
    if report.get("activatedTexts") != EXPECTED_APPROVED_TEXTS:
        raise ValueError("activation report identities drift")
    checksums = report.get("outputChecksumsSha256")
    if not isinstance(checksums, dict):
        raise ValueError("activation report output checksums are missing")
    for relative, expected in checksums.items():
        path = ROOT / relative
        observed = hashlib.sha256(path.read_bytes()).hexdigest()
        if observed != expected:
            raise ValueError(f"activated output checksum drift: {relative}")
    return report


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

#!/usr/bin/env python3
"""Activate the first reviewed NAER catalog tranche from committed evidence.

This migration consumes only committed, candidate-scoped artifacts. It promotes
the eleven approved decisions from the first activation review, synchronizes the
active lexical/grammar catalogs and source projections, and emits a checksum-
locked report. Official bulk workbooks and dictionaries are never read here.
"""

from __future__ import annotations

import csv
import hashlib
import json
import os
from collections import Counter
from pathlib import Path
from typing import Any, Mapping, Sequence

from validate_activation_review_decisions import validate_files

ROOT = Path(__file__).resolve().parents[1]

DEFAULT_BATCH = ROOT / "data/grammar/naer-top-1000-activation-review-batch-1.csv"
DEFAULT_DECISION_REPORT = (
    ROOT / "data/grammar/naer-top-1000-activation-review-batch-1-report.json"
)
DEFAULT_DECISIONS = (
    ROOT / "data/grammar/naer-activation-review-batch-1-decisions-1-25.csv"
)
DEFAULT_WORDS = ROOT / "data/source/words.sample.csv"
DEFAULT_GRAMMAR = ROOT / "data/source/grammar.sample.csv"
DEFAULT_PROVENANCE = ROOT / "data/provenance.csv"
DEFAULT_TOP_CANDIDATES = (
    ROOT / "data/lexicon/naer-1141208-top-1000-candidates.csv"
)
DEFAULT_TOP_CONCISED = (
    ROOT / "data/readings/moe-concised-2014_20260626-naer-top-1000.json"
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
    ROOT / "data/grammar/naer-reviewed-catalog-activation-1-report.json"
)

ADAPTER_VERSION = "naer-reviewed-catalog-activation-v1"
ACTIVATION_PROVENANCE_ID = "local:activation-review-v1"
ACTIVATION_PROVENANCE_ROW = {
    "id": ACTIVATION_PROVENANCE_ID,
    "kind": "manual",
    "title": "Bopomofo Trainer NAER activation review v1",
    "license": "not-applicable",
    "notes": (
        "Reviewed rank-ordered catalog activation decisions; preserves committed "
        "reading and grammar evidence and does not authorize held candidates."
    ),
}

BASELINE_ACTIVE_COUNT = 49
TARGET_ACTIVE_COUNT = 60
EXPECTED_APPROVED_TEXTS = [
    "我",
    "他",
    "你",
    "她",
    "它",
    "自己",
    "他們",
    "地方",
    "孩子",
    "一樣",
    "不會",
]
EXPECTED_READING_COUNTS = {
    "moe-concised": 52,
    "moe-revised": 2,
    "cedict": 4,
    "manual": 2,
}

WORDS_FIELDS = [
    "text",
    "reading",
    "frequency_band",
    "tags",
    "status",
    "provenance_ids",
]
GRAMMAR_FIELDS = [
    "text",
    "reading",
    "roles",
    "predicate_frame",
    "standalone_kind",
    "provenance_ids",
]
PROVENANCE_FIELDS = ["id", "kind", "title", "license", "notes"]
DECISION_FIELDS = [
    "batch_order",
    "general_rank",
    "text",
    "reading_authority",
    "reading_evidence_type",
    "reading_evidence",
    "decision",
    "roles",
    "predicate_frame",
    "standalone_kind",
    "rationale",
]
TOP_CANDIDATE_FIELDS = [
    "text",
    "status",
    "naer_general_rank",
    "written_per_million",
    "spoken_per_million",
    "provenance_ids",
]


def canonical_digest(value: Any) -> str:
    encoded = json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def load_json(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError(f"JSON root must be an object: {path}")
    return payload


def json_text(payload: Mapping[str, Any]) -> str:
    return json.dumps(payload, ensure_ascii=False, indent=2) + "\n"


def load_csv(path: Path, expected_fields: Sequence[str]) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as source:
        reader = csv.DictReader(source)
        if reader.fieldnames != list(expected_fields):
            raise ValueError(
                f"unexpected CSV fields in {path}: {reader.fieldnames!r}; "
                f"expected {list(expected_fields)!r}"
            )
        return [dict(row) for row in reader]


def csv_text(rows: Sequence[Mapping[str, str]], fields: Sequence[str]) -> str:
    from io import StringIO

    destination = StringIO(newline="")
    writer = csv.DictWriter(
        destination,
        fieldnames=list(fields),
        lineterminator="\n",
        extrasaction="raise",
    )
    writer.writeheader()
    writer.writerows(rows)
    return destination.getvalue()


def atomic_write_lf(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    with temporary.open("w", encoding="utf-8", newline="\n") as destination:
        destination.write(text)
        destination.flush()
        os.fsync(destination.fileno())
    temporary.replace(path)


def ensure_unique(rows: Sequence[Mapping[str, str]], key: str, label: str) -> None:
    counts = Counter(row.get(key, "") for row in rows)
    duplicates = sorted(value for value, count in counts.items() if not value or count > 1)
    if duplicates:
        raise ValueError(f"{label} has missing or duplicate {key} values: {duplicates}")


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
    validation = validate_files(batch_path, decision_report_path, decisions_path)
    decisions = load_csv(decisions_path, DECISION_FIELDS)
    approved = [
        row for row in decisions if row["decision"] == "approved-existing-schema"
    ]
    approved_texts = [row["text"] for row in approved]
    if approved_texts != EXPECTED_APPROVED_TEXTS:
        raise ValueError(f"approved activation identities drift: {approved_texts}")
    if any(row["reading_authority"] != "moe-concised" for row in approved):
        raise ValueError("the first activation tranche must resolve entirely through MOE Concised")
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
    retained = [row for row in rows if row["text"] not in approved_set]
    activated = [row_factory(row) for row in approved]
    result = [*retained, *activated]
    if len(result) != TARGET_ACTIVE_COUNT:
        raise ValueError(f"{label} did not produce {TARGET_ACTIVE_COUNT} rows")
    ensure_unique(result, "text", label)
    for row in result:
        if set(row) != set(fields):
            raise ValueError(f"{label} row has unexpected fields: {row}")
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


def load_candidate_commonness(path: Path) -> dict[str, dict[str, Any]]:
    rows = load_csv(path, TOP_CANDIDATE_FIELDS)
    result: dict[str, dict[str, Any]] = {}
    for row in rows:
        text = row["text"]
        if text in result:
            raise ValueError(f"duplicate NAER candidate: {text}")
        try:
            result[text] = {
                "generalRank": int(row["naer_general_rank"]),
                "lexicalText": text,
                "writtenPerMillion": float(row["written_per_million"]),
                "spokenPerMillion": float(row["spoken_per_million"]),
            }
        except ValueError as error:
            raise ValueError(f"invalid NAER candidate numeric value: {text}") from error
    return result


def activate_commonness(
    payload: dict[str, Any],
    candidate_rows: Mapping[str, dict[str, Any]],
    approved_texts: Sequence[str],
    active_texts: set[str],
) -> dict[str, Any]:
    rows = payload.get("rows")
    if not isinstance(rows, list):
        raise ValueError("active commonness projection has no rows")
    activation_state(
        rows,
        key="lexicalText",
        approved_texts=approved_texts,
        label="active commonness projection",
    )
    approved_set = set(approved_texts)
    retained = [
        row for row in rows
        if isinstance(row, dict) and row.get("lexicalText") not in approved_set
    ]
    activated: list[dict[str, Any]] = []
    for text in approved_texts:
        row = candidate_rows.get(text)
        if row is None:
            raise ValueError(f"missing top-1,000 NAER commonness row: {text}")
        activated.append(dict(row))
    final_rows = sorted(
        [*retained, *activated],
        key=lambda row: (int(row["generalRank"]), str(row["lexicalText"])),
    )
    final_texts = {str(row["lexicalText"]) for row in final_rows}
    if final_texts != active_texts:
        raise ValueError("active commonness identities do not equal active catalog identities")

    catalog = payload.get("catalog")
    diagnostics = payload.get("diagnostics")
    if not isinstance(catalog, dict) or not isinstance(diagnostics, dict):
        raise ValueError("active commonness projection metadata is malformed")
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


def projection_rows(payload: Mapping[str, Any], label: str) -> list[dict[str, Any]]:
    rows = payload.get("rows")
    if not isinstance(rows, list) or any(not isinstance(row, dict) for row in rows):
        raise ValueError(f"{label} rows are malformed")
    values = [dict(row) for row in rows]
    identities = [str(row.get("lookupText", "")) for row in values]
    if len(set(identities)) != len(identities) or any(not value for value in identities):
        raise ValueError(f"{label} has missing or duplicate lookupText values")
    return values


def activate_concised(
    active_payload: dict[str, Any],
    top_payload: Mapping[str, Any],
    approved: Sequence[Mapping[str, str]],
) -> dict[str, Any]:
    active_rows = projection_rows(active_payload, "active Concised projection")
    approved_texts = [row["text"] for row in approved]
    activation_state(
        active_rows,
        key="lookupText",
        approved_texts=approved_texts,
        baseline_count=41,
        target_count=52,
        label="active Concised accepted rows",
    )
    top_rows = {
        str(row["lookupText"]): row
        for row in projection_rows(top_payload, "top-1,000 Concised projection")
    }
    approved_set = set(approved_texts)
    retained = [
        row for row in active_rows
        if str(row["lookupText"]) not in approved_set
    ]
    activated: list[dict[str, Any]] = []
    for decision in approved:
        text = decision["text"]
        row = top_rows.get(text)
        if row is None:
            raise ValueError(f"missing top-1,000 Concised row: {text}")
        if row.get("trainerReading") != decision["reading_evidence"]:
            raise ValueError(f"Concised reading no longer matches review decision: {text}")
        activated.append(dict(row))
    final_rows = sorted(
        [*retained, *activated],
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
    unresolved_source_row_delta = int(previous_scoped) - int(previous_accepted)
    scoped_count = len(final_rows) + unresolved_source_row_delta

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
    payload: dict[str, Any],
    *,
    active_texts: set[str],
    concised_texts: set[str],
    concised_sha256: str,
) -> dict[str, Any]:
    rows = projection_rows(payload, "active Revised projection")
    revised_texts = {str(row["lookupText"]) for row in rows}
    fallback_basis = payload.get("fallbackBasis")
    if not isinstance(fallback_basis, dict):
        raise ValueError("active Revised fallbackBasis is malformed")
    fallback_texts = fallback_basis.get("fallbackCandidateTexts")
    if not isinstance(fallback_texts, list) or any(not isinstance(item, str) for item in fallback_texts):
        raise ValueError("active Revised fallback candidate list is malformed")
    expected_fallback = active_texts - concised_texts
    if set(fallback_texts) != expected_fallback:
        raise ValueError("Revised fallback target set changed during activation")
    if not revised_texts.issubset(expected_fallback):
        raise ValueError("Revised accepted rows are outside the fallback target set")
    payload["fallbackBasis"] = {
        **fallback_basis,
        "concisedProjectionChecksumSha256": concised_sha256,
        "concisedAcceptedCandidateCount": len(concised_texts),
        "fallbackCandidateCount": len(expected_fallback),
    }
    return payload


def activate_cedict(
    payload: dict[str, Any],
    *,
    active_texts: set[str],
    moe_accepted_texts: set[str],
) -> dict[str, Any]:
    basis = payload.get("resolutionBasis")
    if not isinstance(basis, dict):
        raise ValueError("active CEDICT resolutionBasis is malformed")
    targets = basis.get("cedictTargetTexts")
    if not isinstance(targets, list) or any(not isinstance(item, str) for item in targets):
        raise ValueError("active CEDICT target list is malformed")
    expected_targets = active_texts - moe_accepted_texts
    if set(targets) != expected_targets:
        raise ValueError("CEDICT target set changed during activation")
    payload["resolutionBasis"] = {
        **basis,
        "candidateEntryCount": TARGET_ACTIVE_COUNT,
        "moeAcceptedCandidateCount": len(moe_accepted_texts),
        "cedictTargetCount": len(expected_targets),
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
                "data/grammar/naer-activation-review-batch-1-decisions-1-25.csv"
            ),
            "externalBulkSourceAccess": "forbidden",
        },
    }
    report_output = json_text(report)

    for path, text in output_texts.items():
        atomic_write_lf(path, text)
    atomic_write_lf(output_report_path, report_output)
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

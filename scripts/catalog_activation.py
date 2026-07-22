#!/usr/bin/env python3
"""Shared mechanics for activating reviewed NAER catalog batches.

Each batch is identified by a small `BatchIdentity`: which decisions slice it
reviews, and the previous batch's committed report (or, only for the very
first batch, an explicit historical baseline). Baseline/target catalog
counts, reading-authority totals, and the approved-text list are derived at
run time from that lineage plus the digest-locked decisions -- a new batch
script does not hardcode catalog size anywhere.
"""

from __future__ import annotations

import csv
import hashlib
import json
import os
from collections import Counter
from dataclasses import dataclass
from io import StringIO
from pathlib import Path
from typing import Any, Callable, Mapping, Sequence

from validate_activation_review_decisions import (
    DECISION_FIELDS,
    ReviewSlice,
    load_locked_inputs,
    validate_review_slice,
)

ROOT = Path(__file__).resolve().parents[1]

DEFAULT_BATCH = ROOT / "data/grammar/naer-top-1000-activation-review-batch-1.csv"
DEFAULT_DECISION_REPORT = (
    ROOT / "data/grammar/naer-top-1000-activation-review-batch-1-report.json"
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
TOP_CANDIDATE_FIELDS = [
    "text",
    "status",
    "naer_general_rank",
    "written_per_million",
    "spoken_per_million",
    "provenance_ids",
]

# Maps a decision row's `reading_authority` to the label used in cumulative
# readingAuthorityCounts reports. "manual" never appears here: it is never
# produced by this pipeline, only carried forward from the pre-review catalog.
READING_AUTHORITY_LABELS = {
    "moe-concised": "moe-concised",
    "moe-revised": "moe-revised",
    "cedict-unique": "cedict",
}


@dataclass(frozen=True)
class BatchIdentity:
    """Identity and lineage for one activation batch.

    `previous_report_path` chains this batch's baseline counts off the prior
    batch's committed report, so a new batch never needs to restate catalog
    size. Only the very first batch has no predecessor to chain from, so it
    supplies `initial_baseline_count`/`initial_reading_authority_counts`
    directly instead.
    """

    slug: str
    order_range_label: str
    review_slice: ReviewSlice
    previous_report_path: Path | None
    initial_baseline_count: int | None = None
    initial_reading_authority_counts: Mapping[str, int] | None = None

    @property
    def adapter_version(self) -> str:
        return f"naer-reviewed-catalog-activation-{self.slug}"

    @property
    def provenance_id(self) -> str:
        return f"local:activation-review-{self.slug}"

    @property
    def provenance_row(self) -> dict[str, str]:
        return {
            "id": self.provenance_id,
            "kind": "manual",
            "title": f"Bopomofo Trainer NAER activation review {self.slug}",
            "license": "not-applicable",
            "notes": (
                "Reviewed rank-ordered catalog activation decisions for batch "
                f"{self.order_range_label}; preserves committed reading and "
                "grammar evidence and excludes held candidates."
            ),
        }

    @property
    def decisions_path(self) -> Path:
        return self.review_slice.decisions_path

    @property
    def grammar_decision_source(self) -> str:
        return self.decisions_path.relative_to(ROOT).as_posix()


# ---- generic byte/CSV/JSON helpers ----


def canonical_digest(value: Any) -> str:
    encoded = json.dumps(
        value, ensure_ascii=False, sort_keys=True, separators=(",", ":")
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


def projection_rows(payload: Mapping[str, Any], label: str) -> list[dict[str, Any]]:
    rows = payload.get("rows")
    if not isinstance(rows, list) or any(not isinstance(row, dict) for row in rows):
        raise ValueError(f"{label} rows are malformed")
    values = [dict(row) for row in rows]
    identities = [str(row.get("lookupText", "")) for row in values]
    if len(set(identities)) != len(identities) or any(not value for value in identities):
        raise ValueError(f"{label} has missing or duplicate lookupText values")
    return values


# ---- baseline/target resolution: the piece that removes per-batch hardcoding ----


def resolve_baseline_state(batch: BatchIdentity) -> tuple[int, dict[str, int]]:
    if batch.previous_report_path is None:
        if batch.initial_baseline_count is None or batch.initial_reading_authority_counts is None:
            raise ValueError(
                f"{batch.slug} has no previous report and no initial baseline state"
            )
        return batch.initial_baseline_count, dict(batch.initial_reading_authority_counts)
    previous = load_json(batch.previous_report_path)
    return int(previous["activeCount"]), dict(previous["readingAuthorityCounts"])


def compute_reading_authority_counts(
    previous_counts: Mapping[str, int],
    approved: Sequence[Mapping[str, str]],
) -> dict[str, int]:
    result = dict(previous_counts)
    for row in approved:
        label = READING_AUTHORITY_LABELS[row["reading_authority"]]
        result[label] = result.get(label, 0) + 1
    return result


# ---- activation mechanics (parameterized by baseline/target, not module constants) ----


def activation_state(
    rows: Sequence[Mapping[str, Any]],
    *,
    key: str,
    approved_texts: Sequence[str],
    baseline_count: int,
    target_count: int,
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


def expected_word_row(decision: Mapping[str, str], provenance_id: str) -> dict[str, str]:
    return {
        "text": decision["text"],
        "reading": decision["reading_evidence"],
        "frequency_band": "1",
        "tags": "general",
        "status": "reviewed",
        "provenance_ids": provenance_id,
    }


def expected_grammar_row(decision: Mapping[str, str], provenance_id: str) -> dict[str, str]:
    return {
        "text": decision["text"],
        "reading": decision["reading_evidence"],
        "roles": decision["roles"],
        "predicate_frame": decision["predicate_frame"],
        "standalone_kind": decision["standalone_kind"],
        "provenance_ids": provenance_id,
    }


def activate_csv_rows(
    rows: list[dict[str, str]],
    approved: Sequence[Mapping[str, str]],
    *,
    fields: Sequence[str],
    row_factory: Callable[[Mapping[str, str]], dict[str, str]],
    baseline_count: int,
    target_count: int,
    label: str,
) -> list[dict[str, str]]:
    approved_texts = [row["text"] for row in approved]
    activation_state(
        rows,
        key="text",
        approved_texts=approved_texts,
        baseline_count=baseline_count,
        target_count=target_count,
        label=label,
    )
    approved_set = set(approved_texts)
    result = [
        *(row for row in rows if row["text"] not in approved_set),
        *(row_factory(row) for row in approved),
    ]
    if len(result) != target_count:
        raise ValueError(f"{label} did not produce {target_count} rows")
    ensure_unique(result, "text", label)
    if any(set(row) != set(fields) for row in result):
        raise ValueError(f"{label} contains unexpected fields")
    return result


def activate_provenance(
    rows: list[dict[str, str]],
    *,
    provenance_id: str,
    provenance_row: Mapping[str, str],
) -> list[dict[str, str]]:
    ensure_unique(rows, "id", "provenance")
    existing = next((row for row in rows if row["id"] == provenance_id), None)
    if existing is not None:
        if existing != provenance_row:
            raise ValueError("activation provenance row differs from the locked definition")
        return rows
    return [*rows, dict(provenance_row)]


def activate_commonness(
    payload: dict[str, Any],
    candidate_rows: Mapping[str, dict[str, Any]],
    approved_texts: Sequence[str],
    active_texts: set[str],
    *,
    baseline_count: int,
    target_count: int,
) -> dict[str, Any]:
    rows = payload.get("rows")
    if not isinstance(rows, list) or any(not isinstance(row, dict) for row in rows):
        raise ValueError("active commonness projection has malformed rows")
    activation_state(
        rows,
        key="lexicalText",
        approved_texts=approved_texts,
        baseline_count=baseline_count,
        target_count=target_count,
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
        "entryCount": target_count,
        "normalizedTextCount": target_count,
    }
    payload["rows"] = final_rows
    payload["diagnostics"] = {
        **diagnostics,
        "catalogScopedSourceRowCount": target_count,
        "unmatchedCatalogTexts": [],
        "ambiguousCatalogTexts": [],
        "omittedNonCatalogSourceRowCount": source_row_count - target_count,
    }
    return payload


def activate_concised(
    active_payload: dict[str, Any],
    top_payload: Mapping[str, Any],
    approved: Sequence[Mapping[str, str]],
    *,
    baseline_count: int,
    target_count: int,
    active_catalog_count: int,
) -> dict[str, Any]:
    """`baseline_count`/`target_count` scope the Concised-accepted row count
    itself (e.g. 70 -> 101); `active_catalog_count` is the *whole* active
    catalog's size (e.g. 114), which is the candidate search scope recorded
    in `candidateSet` regardless of how many of those candidates Concised
    resolved.
    """
    active_rows = projection_rows(active_payload, "active Concised projection")
    approved_rows = [row for row in approved if row["reading_authority"] == "moe-concised"]
    approved_texts = [row["text"] for row in approved_rows]
    activation_state(
        active_rows,
        key="lookupText",
        approved_texts=approved_texts,
        baseline_count=baseline_count,
        target_count=target_count,
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
    if len(final_rows) != target_count:
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
        "entryCount": active_catalog_count,
        "normalizedTextCount": active_catalog_count,
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
    baseline_count: int,
    target_count: int,
) -> dict[str, Any]:
    active_rows = projection_rows(active_payload, "active Revised projection")
    approved_rows = [row for row in approved if row["reading_authority"] == "moe-revised"]
    approved_texts = [row["text"] for row in approved_rows]
    activation_state(
        active_rows,
        key="lookupText",
        approved_texts=approved_texts,
        baseline_count=baseline_count,
        target_count=target_count,
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
    if len(final_rows) != target_count:
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
    target_count: int,
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
        "candidateEntryCount": target_count,
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


def load_review_decisions(
    batch: BatchIdentity,
    batch_path: Path,
    decision_report_path: Path,
    decisions_path: Path | None = None,
) -> tuple[list[dict[str, str]], list[dict[str, str]], dict[str, Any]]:
    batch_rows, _ = load_locked_inputs(batch_path, decision_report_path)
    validation = validate_review_slice(
        batch_rows, batch.review_slice, decisions_path or batch.decisions_path
    )
    decisions = load_csv(decisions_path or batch.decisions_path, DECISION_FIELDS)
    approved = [row for row in decisions if row["decision"] == "approved-existing-schema"]
    if any(row["reading_evidence_type"] != "trainer-bopomofo" for row in approved):
        raise ValueError("approved activation readings must be trainer Bopomofo")
    held = [row for row in decisions if row["decision"] != "approved-existing-schema"]
    return approved, held, validation


def run_activation(
    batch: BatchIdentity,
    *,
    output_report_path: Path,
    batch_path: Path = DEFAULT_BATCH,
    decision_report_path: Path = DEFAULT_DECISION_REPORT,
    decisions_path: Path | None = None,
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
) -> dict[str, Any]:
    approved, held, decision_validation = load_review_decisions(
        batch, batch_path, decision_report_path, decisions_path
    )
    approved_texts = [row["text"] for row in approved]
    baseline_count, previous_reading_counts = resolve_baseline_state(batch)
    target_count = baseline_count + len(approved_texts)
    reading_counts = compute_reading_authority_counts(previous_reading_counts, approved)

    words = activate_csv_rows(
        load_csv(words_path, WORDS_FIELDS),
        approved,
        fields=WORDS_FIELDS,
        row_factory=lambda decision: expected_word_row(decision, batch.provenance_id),
        baseline_count=baseline_count,
        target_count=target_count,
        label="active lexical catalog",
    )
    grammar = activate_csv_rows(
        load_csv(grammar_path, GRAMMAR_FIELDS),
        approved,
        fields=GRAMMAR_FIELDS,
        row_factory=lambda decision: expected_grammar_row(decision, batch.provenance_id),
        baseline_count=baseline_count,
        target_count=target_count,
        label="active grammar sidecar",
    )
    provenance = activate_provenance(
        load_csv(provenance_path, PROVENANCE_FIELDS),
        provenance_id=batch.provenance_id,
        provenance_row=batch.provenance_row,
    )
    active_texts = {row["text"] for row in words}
    if {row["text"] for row in grammar} != active_texts:
        raise ValueError("active grammar identities do not equal active lexical identities")
    validate_held_absence(active_texts, held)

    commonness = activate_commonness(
        load_json(commonness_path),
        load_candidate_commonness(top_candidates_path),
        approved_texts,
        active_texts,
        baseline_count=baseline_count,
        target_count=target_count,
    )
    concised = activate_concised(
        load_json(concised_path),
        load_json(top_concised_path),
        approved,
        baseline_count=previous_reading_counts.get("moe-concised", 0),
        target_count=reading_counts["moe-concised"],
        active_catalog_count=target_count,
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
        baseline_count=previous_reading_counts.get("moe-revised", 0),
        target_count=reading_counts["moe-revised"],
    )
    revised_texts = {
        str(row["lookupText"])
        for row in projection_rows(revised, "activated Revised projection")
    }
    cedict = activate_cedict(
        load_json(cedict_path),
        active_texts=active_texts,
        moe_accepted_texts=concised_texts | revised_texts,
        target_count=target_count,
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
        "baselineActiveCount": baseline_count,
        "activeCount": target_count,
        "activatedCount": len(approved_texts),
        "activatedTexts": approved_texts,
        "readingAuthorityCounts": reading_counts,
        "grammarAnnotationCount": len(grammar),
        "commonnessRowCount": len(commonness["rows"]),
        "heldDecisionCount": len(held),
        "outputChecksumsSha256": dict(sorted(output_checksums.items())),
    }
    report = {
        "adapterVersion": batch.adapter_version,
        **report_core,
        "determinismDigest": canonical_digest(report_core),
        "policy": {
            "stageEligibilityChange": "forbidden",
            "heldCandidateActivation": "forbidden",
            "grammarDecisionSource": batch.grammar_decision_source,
            "externalBulkSourceAccess": "forbidden",
        },
    }
    for path, text in output_texts.items():
        atomic_write_lf(path, text)
    atomic_write_lf(output_report_path, json_text(report))
    return report


def validate_committed_activation(batch: BatchIdentity, report_path: Path) -> dict[str, Any]:
    report = load_json(report_path)
    if report.get("adapterVersion") != batch.adapter_version:
        raise ValueError("unexpected activation report adapter version")
    report_core = {
        key: value
        for key, value in report.items()
        if key not in {"adapterVersion", "determinismDigest", "policy"}
    }
    if report.get("determinismDigest") != canonical_digest(report_core):
        raise ValueError("activation report determinism digest mismatch")
    baseline_count, _ = resolve_baseline_state(batch)
    expected_active_count = baseline_count + batch.review_slice.expected_approved
    if report.get("activeCount") != expected_active_count:
        raise ValueError("activation report active count mismatch")
    if len(report.get("activatedTexts", [])) != batch.review_slice.expected_approved:
        raise ValueError("activation report activated-text count mismatch")
    checksums = report.get("outputChecksumsSha256")
    if not isinstance(checksums, dict):
        raise ValueError("activation report output checksums are missing")
    for relative, expected in checksums.items():
        path = ROOT / relative
        observed = hashlib.sha256(path.read_bytes()).hexdigest()
        if observed != expected:
            raise ValueError(f"activated output checksum drift: {relative}")
    return report

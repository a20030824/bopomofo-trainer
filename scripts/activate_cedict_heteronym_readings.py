#!/usr/bin/env python3
"""Activates CC-CEDICT heteronyms from the NAER top-1000 list.

These are texts whose reading was previously unresolvable to a single value
(multiple distinct CC-CEDICT pinyin records) and were therefore excluded from
every activation batch entirely (`reading-review-required`). Per an explicit
product decision, this activates every distinct converted Bopomofo reading as
its own practice entry rather than picking one: the trainer practices
pronunciation, not word-sense disambiguation, so there is no single "correct"
reading to select the way the top-1000 reading-coverage summary's
`ambiguousReadingSelection: forbidden` policy assumes a human would choose.

A text is only activated when the same statistical grammar-classification
rule used elsewhere (see auto_classify_activation_batch.classify) can approve
it from the shared per-text UD evidence -- words without a clean signal are
left out, same as any other candidate. Every reading variant of an activated
text shares that one grammar decision, since UD evidence does not distinguish
which specific reading was used in a given sentence.

Existing text alone never suppresses another pronunciation. Identity is the
``(text, reading)`` pair: readings already present in the active catalog are
left untouched, while every missing distinct CEDICT pronunciation is added.
When a text is already active, its existing syntax-only grammar annotation is
reused if all of its active readings agree. Meaning and sense selection are
never used to choose or discard a pronunciation.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from activation_review_batch import significant_upos  # noqa: E402
from activation_review_batch_common import (  # noqa: E402
    DEFAULT_CANDIDATES,
    DEFAULT_MIN_OCCURRENCES,
    DEFAULT_UD_COVERAGE,
    DEFAULT_UD_EVIDENCE,
    EXPECTED_CANDIDATE_COUNT,
    EXPECTED_UD_COVERAGE_DIGEST,
    EXPECTED_UD_EVIDENCE_DIGEST,
    EXPECTED_UD_REVIEW_COUNT,
    REVIEW_LANES,
    load_candidates,
    load_json,
    load_ud,
)
from auto_classify_activation_batch import classify  # noqa: E402
from catalog_activation import (  # noqa: E402
    DEFAULT_ACTIVE_CONCISED,
    DEFAULT_ACTIVE_REVISED,
    DEFAULT_GRAMMAR,
    DEFAULT_PROVENANCE,
    DEFAULT_TOP_CONCISED,
    DEFAULT_TOP_REVISED,
    DEFAULT_WORDS,
    GRAMMAR_FIELDS,
    PROVENANCE_FIELDS,
    WORDS_FIELDS,
    activate_concised,
    activate_revised,
    atomic_write_lf,
    convert_numbered_pinyin,
    csv_text,
    json_text,
    load_csv,
    projection_rows,
    sha256_text,
)

CEDICT_TOP1000 = ROOT / "data/identity/cedict-2026-07-21-naer-top-1000-hints.json"
MANUAL_OVERRIDES_PATH = ROOT / "data/readings/manual-reading-overrides.json"

PROVENANCE_ID = "local:activation-review-v5-heteronym"
PROVENANCE_ROW = {
    "id": PROVENANCE_ID,
    "kind": "manual",
    "title": "Bopomofo Trainer NAER heteronym activation",
    "license": "not-applicable",
    "notes": (
        "Activates CC-CEDICT heteronyms with every distinct converted "
        "reading as a separate practice entry; grammar role assignment "
        "reuses the same statistical rule as other automated activation "
        "batches. Readings are included without picking a single sense, per "
        "the recorded product decision to prioritize pronunciation coverage "
        "over word-sense disambiguation."
    ),
}


def load_ambiguous_cedict_records() -> dict[str, list[dict[str, Any]]]:
    payload = load_json(CEDICT_TOP1000)
    if payload.get("adapterVersion") != "cedict-identity-hints-adapter-v1":
        raise ValueError("unexpected CEDICT adapter version")
    result: dict[str, list[dict[str, Any]]] = {}
    for row in payload["rows"]:
        if row.get("status") == "ambiguous-records":
            result[row["lookupText"]] = row["records"]
    return result


def eligible_dominant_upos(
    ud: dict[str, Any],
    significant_min_count: int,
    significant_min_share: float,
) -> str | None:
    if ud.get("occurrenceCount", 0) < DEFAULT_MIN_OCCURRENCES:
        return None
    dominant = ud.get("dominantUpos")
    significant = significant_upos(ud, significant_min_count, significant_min_share)
    if (
        not isinstance(dominant, list)
        or len(dominant) != 1
        or len(significant) != 1
        or dominant[0] != significant[0]
    ):
        return None
    tag = dominant[0]
    return tag if tag in REVIEW_LANES else None


def classifier_row(text: str, ud: dict[str, Any], dominant_upos: str) -> dict[str, str]:
    verb_evidence = ud.get("verbEvidence")
    verb_object_frame = ""
    if isinstance(verb_evidence, dict):
        value = verb_evidence.get("observedObjectFrame")
        if isinstance(value, str):
            verb_object_frame = value

    def compact_counts(value: Any) -> str:
        if not isinstance(value, dict):
            return ""
        return ";".join(f"{key}={value[key]}" for key in sorted(value) if isinstance(value[key], int))

    return {
        "text": text,
        "reading_authority": "cedict-ambiguous",
        "reading_evidence_type": "numbered-pinyin",
        "reading_evidence": "",
        "review_lane": REVIEW_LANES[dominant_upos],
        "occurrence_count": str(ud.get("occurrenceCount", 0)),
        "dominant_upos": dominant_upos,
        "upos_counts": compact_counts(ud.get("uposCounts", {})),
        "dependency_relation_counts": compact_counts(ud.get("dependencyRelationCounts", {})),
        "root_count": str(ud.get("rootCount", 0)),
        "verb_object_frame": verb_object_frame,
    }


def build_heteronym_activations() -> list[dict[str, Any]]:
    candidates = load_candidates(DEFAULT_CANDIDATES, EXPECTED_CANDIDATE_COUNT)
    candidate_set = {row["text"] for row in candidates}
    active_words = load_csv(DEFAULT_WORDS, WORDS_FIELDS)
    active_grammar = load_csv(DEFAULT_GRAMMAR, GRAMMAR_FIELDS)
    active_readings_by_text: dict[str, set[str]] = {}
    grammar_by_text: dict[str, set[tuple[str, str, str]]] = {}
    for row in active_words:
        active_readings_by_text.setdefault(row["text"], set()).add(row["reading"])
    for row in active_grammar:
        grammar_by_text.setdefault(row["text"], set()).add((
            row["roles"], row["predicate_frame"], row["standalone_kind"],
        ))
    ud_rows, ud_review, significant_min_count, significant_min_share = load_ud(
        candidate_set,
        load_json(DEFAULT_UD_EVIDENCE),
        load_json(DEFAULT_UD_COVERAGE),
        expected_evidence_digest=EXPECTED_UD_EVIDENCE_DIGEST,
        expected_coverage_digest=EXPECTED_UD_COVERAGE_DIGEST,
        expected_review_count=EXPECTED_UD_REVIEW_COUNT,
    )
    ambiguous = load_ambiguous_cedict_records()

    pinyin_to_convert: list[str] = []
    for records in ambiguous.values():
        for record in records:
            pinyin_to_convert.append(record["pinyin"])
    converted = dict(zip(pinyin_to_convert, convert_numbered_pinyin(pinyin_to_convert), strict=True))

    activations: list[dict[str, Any]] = []
    for text in sorted(ambiguous):
        if text not in candidate_set:
            continue
        readings = sorted({converted[record["pinyin"]] for record in ambiguous[text]})
        missing_readings = sorted(set(readings) - active_readings_by_text.get(text, set()))
        if not missing_readings:
            continue

        existing_grammar = grammar_by_text.get(text, set())
        if existing_grammar:
            if len(existing_grammar) != 1:
                raise ValueError(
                    f"active heteronym text has conflicting grammar annotations: {text}"
                )
            roles, frame, standalone = next(iter(existing_grammar))
            rationale = "Reuses the active text's syntax-only grammar annotation"
        else:
            if text in ud_review:
                continue
            ud = ud_rows.get(text)
            if ud is None:
                continue
            dominant_upos = eligible_dominant_upos(
                ud, significant_min_count, significant_min_share
            )
            if dominant_upos is None:
                continue
            decision, roles, frame, standalone, rationale = classify(
                classifier_row(text, ud, dominant_upos)
            )
            if decision != "approved-existing-schema":
                continue

        activations.append({
            "text": text,
            "readings": missing_readings,
            "roles": roles,
            "predicate_frame": frame,
            "standalone_kind": standalone,
            "rationale": rationale,
        })
    return activations


def apply_activations(activations: list[dict[str, Any]]) -> None:
    words = load_csv(DEFAULT_WORDS, WORDS_FIELDS)
    grammar = load_csv(DEFAULT_GRAMMAR, GRAMMAR_FIELDS)
    provenance = load_csv(DEFAULT_PROVENANCE, PROVENANCE_FIELDS)
    manual = load_json(MANUAL_OVERRIDES_PATH)

    if not any(row["id"] == PROVENANCE_ID for row in provenance):
        provenance = [*provenance, dict(PROVENANCE_ROW)]

    for activation in activations:
        for reading in activation["readings"]:
            words.append({
                "text": activation["text"],
                "reading": reading,
                "frequency_band": "1",
                "tags": "general",
                "status": "reviewed",
                "provenance_ids": PROVENANCE_ID,
            })
            grammar.append({
                "text": activation["text"],
                "reading": reading,
                "roles": activation["roles"],
                "predicate_frame": activation["predicate_frame"],
                "standalone_kind": activation["standalone_kind"],
                "provenance_ids": PROVENANCE_ID,
            })
            manual["rows"].append({
                "text": activation["text"],
                "reading": reading,
                "reason": (
                    "One of this heteronym's distinct CC-CEDICT pronunciations; "
                    "included by exact text-and-reading identity without "
                    "meaning or sense selection."
                ),
            })

    atomic_write_lf(DEFAULT_WORDS, csv_text(words, WORDS_FIELDS))
    atomic_write_lf(DEFAULT_GRAMMAR, csv_text(grammar, GRAMMAR_FIELDS))
    atomic_write_lf(DEFAULT_PROVENANCE, csv_text(provenance, PROVENANCE_FIELDS))
    atomic_write_lf(
        MANUAL_OVERRIDES_PATH,
        json.dumps(manual, ensure_ascii=False, indent=2) + "\n",
    )

    # These heteronym rows are added outside the normal review-batch/decision
    # pipeline (there is no 1-decision-per-text mapping for a text with
    # several active readings), so the MOE Concised/Revised active-catalog
    # projections' own candidate-scope bookkeeping needs a matching update
    # here -- with an empty `approved` list, since no text here is resolved
    # by either MOE authority. This mirrors exactly what catalog_activation's
    # run_activation does for every ordinary batch.
    active_texts = {row["text"] for row in words}
    concised_payload = load_json(DEFAULT_ACTIVE_CONCISED)
    concised_row_count = len(projection_rows(concised_payload, "active Concised projection"))
    concised = activate_concised(
        concised_payload,
        load_json(DEFAULT_TOP_CONCISED),
        approved=[],
        baseline_count=concised_row_count,
        target_count=concised_row_count,
        active_catalog_count=len(active_texts),
    )
    concised_output = json_text(concised)
    atomic_write_lf(DEFAULT_ACTIVE_CONCISED, concised_output)
    concised_sha256 = sha256_text(concised_output)
    concised_texts = {
        str(row["lookupText"]) for row in projection_rows(concised, "activated Concised projection")
    }

    revised_payload = load_json(DEFAULT_ACTIVE_REVISED)
    revised_row_count = len(projection_rows(revised_payload, "active Revised projection"))
    revised = activate_revised(
        revised_payload,
        load_json(DEFAULT_TOP_REVISED),
        approved=[],
        active_texts=active_texts,
        concised_texts=concised_texts,
        concised_sha256=concised_sha256,
        baseline_count=revised_row_count,
        target_count=revised_row_count,
    )
    atomic_write_lf(DEFAULT_ACTIVE_REVISED, json_text(revised))


def main() -> None:
    activations = build_heteronym_activations()
    apply_activations(activations)
    total_readings = sum(len(activation["readings"]) for activation in activations)
    print(
        f"activated {len(activations)} heteronym texts with "
        f"{total_readings} total reading rows"
    )


if __name__ == "__main__":
    main()

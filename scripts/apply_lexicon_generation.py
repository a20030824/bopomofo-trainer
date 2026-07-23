#!/usr/bin/env python3
"""Applies a manifest-linked lexicon generation to the active catalog.

This is a clean-replace apply step: it writes a brand new words.sample.csv
and grammar.sample.csv from a generation's activation report, discarding
whatever was there before. It does not merge with or preserve the previous
active catalog -- that is a deliberate product decision the caller makes by
choosing to run this script, not a default.

Two sources of new entries, matching every prior activation policy in this
project's history:

1. Ordinary resolved-new-identity candidates whose UD evidence clears the
   same statistical eligibility bar used elsewhere
   (catalog_generation_policy.classify / eligible_dominant_upos). A
   candidate with a resolved reading but no clean single-dominant-UPOS
   signal is left out of this batch entirely -- there is no precedent in
   this catalog for a word with an empty/guessed grammar role, and this
   script does not create one.
2. CC-CEDICT heteronyms with more than one distinct reading, activated with
   every distinct reading as its own entry (never picking one), reusing
   activate_cedict_heteronym_readings_generation's exact logic.

Always preview with --dry-run first.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
SCRIPT_DIR = ROOT / "scripts"
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from activate_cedict_heteronym_readings_generation import (  # noqa: E402
    classifier_row,
    eligible_dominant_upos,
    load_ambiguous_cedict_records,
    load_ud_v2,
)
from catalog_generation_policy import (  # noqa: E402
    DEFAULT_GRAMMAR,
    DEFAULT_MIN_OCCURRENCES,
    DEFAULT_PROVENANCE,
    DEFAULT_WORDS,
    GRAMMAR_FIELDS,
    PROVENANCE_FIELDS,
    WORDS_FIELDS,
    atomic_write_lf,
    classify,
    convert_numbered_pinyin,
    csv_text,
    load_json,
)
from lexicon_candidate_set import load_candidate_set  # noqa: E402

DEFAULT_MANUAL_OVERRIDES = ROOT / "data/readings/manual-reading-overrides.json"


def load_activation_report(path: Path) -> dict[str, Any]:
    payload = load_json(path)
    if payload.get("adapterVersion") != "lexicon-activation-generation-v1":
        raise ValueError("unexpected activation report adapter version")
    return payload


def build_ordinary_activations(
    report: dict[str, Any],
    ud_rows: dict[str, dict[str, Any]],
    min_occurrences: int,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    included: list[dict[str, Any]] = []
    excluded: list[dict[str, Any]] = []
    for row in report["rows"]:
        if row["status"] != "resolved-new-identity":
            continue
        text = row["text"]
        reading = row["reading"]["evidence"]
        ud = ud_rows.get(text)
        if ud is None:
            excluded.append({"text": text, "reason": "no-ud-evidence"})
            continue
        dominant_upos = eligible_dominant_upos(ud, min_occurrences)
        if dominant_upos is None:
            excluded.append({"text": text, "reason": "no-clean-dominant-upos"})
            continue
        decision, roles, frame, standalone, rationale = classify(classifier_row(text, ud, dominant_upos))
        if decision != "approved-existing-schema":
            excluded.append({"text": text, "reason": decision})
            continue
        included.append({
            "text": text,
            "reading": reading,
            "roles": roles,
            "predicate_frame": frame,
            "standalone_kind": standalone,
            "rationale": rationale,
        })
    return included, excluded


def build_heteronym_activations(
    cedict_projection_path: Path,
    candidate_set: set[str],
    ud_rows: dict[str, dict[str, Any]],
    min_occurrences: int,
    already_included_texts: set[str],
) -> list[dict[str, Any]]:
    ambiguous = load_ambiguous_cedict_records(cedict_projection_path)
    pinyin_to_convert: list[str] = []
    for text, records in ambiguous.items():
        if text not in candidate_set or text in already_included_texts:
            continue
        for record in records:
            pinyin_to_convert.append(record["pinyin"])
    converted = dict(zip(pinyin_to_convert, convert_numbered_pinyin(pinyin_to_convert), strict=True))

    activations: list[dict[str, Any]] = []
    for text in sorted(ambiguous):
        if text not in candidate_set or text in already_included_texts:
            continue
        records = [r for r in ambiguous[text] if r["pinyin"] in converted]
        if not records:
            continue
        readings = sorted({converted[record["pinyin"]] for record in records})
        ud = ud_rows.get(text)
        if ud is None:
            continue
        dominant_upos = eligible_dominant_upos(ud, min_occurrences)
        if dominant_upos is None:
            continue
        decision, roles, frame, standalone, rationale = classify(classifier_row(text, ud, dominant_upos))
        if decision != "approved-existing-schema":
            continue
        for reading in readings:
            activations.append({
                "text": text,
                "reading": reading,
                "roles": roles,
                "predicate_frame": frame,
                "standalone_kind": standalone,
                "rationale": rationale + " (heteronym: every distinct reading included)",
            })
    return activations


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--candidates", required=True, type=Path)
    parser.add_argument("--candidate-manifest", required=True, type=Path)
    parser.add_argument("--activation-report", required=True, type=Path)
    parser.add_argument("--cedict-projection", required=True, type=Path)
    parser.add_argument("--ud-evidence", required=True, type=Path)
    parser.add_argument("--ud-coverage", required=True, type=Path)
    parser.add_argument("--words", default=DEFAULT_WORDS, type=Path)
    parser.add_argument("--grammar", default=DEFAULT_GRAMMAR, type=Path)
    parser.add_argument("--provenance", default=DEFAULT_PROVENANCE, type=Path)
    parser.add_argument("--manual-overrides", default=DEFAULT_MANUAL_OVERRIDES, type=Path)
    parser.add_argument("--provenance-id", required=True)
    parser.add_argument("--provenance-title", required=True)
    parser.add_argument("--min-occurrences", default=DEFAULT_MIN_OCCURRENCES, type=int)
    parser.add_argument("--dry-run", action="store_true")
    arguments = parser.parse_args()

    generation = load_candidate_set(arguments.candidates, arguments.candidate_manifest, require_manifest=True)
    candidate_set = set(generation.texts)
    report = load_activation_report(arguments.activation_report)
    ud_rows, _review_set = load_ud_v2(
        candidate_set,
        load_json(arguments.ud_evidence),
        load_json(arguments.ud_coverage),
    )

    ordinary, excluded = build_ordinary_activations(report, ud_rows, arguments.min_occurrences)
    ordinary_texts = {row["text"] for row in ordinary}
    heteronyms = build_heteronym_activations(
        arguments.cedict_projection,
        candidate_set,
        ud_rows,
        arguments.min_occurrences,
        ordinary_texts,
    )
    activations = ordinary + heteronyms

    from collections import Counter
    exclusion_reasons = Counter(row["reason"] for row in excluded)
    print(
        f"{len(ordinary)} ordinary + {len(heteronyms)} heteronym-reading activations "
        f"= {len(activations)} total rows; {len(excluded)} excluded {dict(exclusion_reasons)}"
    )

    if arguments.dry_run:
        return

    words_rows = [
        {
            "text": row["text"],
            "reading": row["reading"],
            "frequency_band": "1",
            "tags": "general",
            "status": "reviewed",
            "provenance_ids": arguments.provenance_id,
        }
        for row in activations
    ]
    grammar_rows = [
        {
            "text": row["text"],
            "reading": row["reading"],
            "roles": row["roles"],
            "predicate_frame": row["predicate_frame"],
            "standalone_kind": row["standalone_kind"],
            "provenance_ids": arguments.provenance_id,
        }
        for row in activations
    ]
    atomic_write_lf(arguments.words, csv_text(words_rows, WORDS_FIELDS))
    atomic_write_lf(arguments.grammar, csv_text(grammar_rows, GRAMMAR_FIELDS))

    provenance = [
        row
        for row in (
            _read_provenance(arguments.provenance)
            if arguments.provenance.exists()
            else []
        )
    ]
    if not any(row["id"] == arguments.provenance_id for row in provenance):
        provenance.append({
            "id": arguments.provenance_id,
            "kind": "manual",
            "title": arguments.provenance_title,
            "license": "not-applicable",
            "notes": (
                "Clean-replace catalog generation from the forward lexicon pipeline. "
                "Grammar roles approved by the same statistical heuristic used by prior "
                "automated activation batches; not manually reviewed per-word."
            ),
        })
    atomic_write_lf(arguments.provenance, csv_text(provenance, PROVENANCE_FIELDS))
    print(f"wrote {len(activations)} rows to {arguments.words} and {arguments.grammar}")


def _read_provenance(path: Path) -> list[dict[str, str]]:
    import csv

    with path.open("r", encoding="utf-8-sig", newline="") as source:
        return list(csv.DictReader(source))


if __name__ == "__main__":
    main()

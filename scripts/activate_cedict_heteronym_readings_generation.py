#!/usr/bin/env python3
"""Manifest-driven CC-CEDICT heteronym activation for any candidate generation.

It consumes one manifest-linked generation and contains no historical batch
paths, fixed candidate counts, or replay digests. See
docs/reference-sources/naer-lexicon-scaling.md.

Same product decision as the historical script: a CC-CEDICT text with more
than one distinct pinyin reading is not sent to human review to pick "the"
reading. Every distinct converted Bopomofo reading is activated as its own
`(text, reading)` practice entry, gated only by the same statistical
grammar-classification policy used by forward catalog generation. Meaning and
sense selection are never used to choose or discard a pronunciation.

This script mutates the live active catalog (`data/source/words.sample.csv`
and friends) when run without `--dry-run`. Always preview with `--dry-run`
first.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
SCRIPT_DIR = ROOT / "scripts"
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from catalog_generation_policy import (  # noqa: E402
    DEFAULT_ACTIVE_CONCISED,
    DEFAULT_ACTIVE_REVISED,
    DEFAULT_GRAMMAR,
    DEFAULT_MIN_OCCURRENCES,
    DEFAULT_PROVENANCE,
    DEFAULT_WORDS,
    GRAMMAR_FIELDS,
    PROVENANCE_FIELDS,
    REVIEW_LANES,
    WORDS_FIELDS,
    atomic_write_lf,
    classify,
    convert_numbered_pinyin,
    csv_text,
    json_text,
    load_csv,
    load_json,
    projection_rows,
    refresh_concised_scope,
    refresh_revised_scope,
    sha256_text,
    significant_upos,
)
from lexicon_candidate_set import load_candidate_set  # noqa: E402

DEFAULT_MANUAL_OVERRIDES = ROOT / "data/readings/manual-reading-overrides.json"

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


def load_ambiguous_cedict_records(path: Path) -> dict[str, list[dict[str, Any]]]:
    payload = load_json(path)
    if payload.get("adapterVersion") != "cedict-identity-hints-adapter-v1":
        raise ValueError("unexpected CEDICT adapter version")
    result: dict[str, list[dict[str, Any]]] = {}
    for row in payload["rows"]:
        if row.get("status") == "ambiguous-records":
            result[row["lookupText"]] = row["records"]
    return result


def load_ud_v2(
    candidate_set: set[str],
    evidence: dict[str, Any],
    coverage: dict[str, Any],
) -> tuple[dict[str, dict[str, Any]], set[str], int, float]:
    if evidence.get("adapterVersion") != "ud-chinese-gsd-grammar-evidence-adapter-v2":
        raise ValueError("unexpected UD evidence adapter version")
    if coverage.get("adapterVersion") != "ud-chinese-gsd-grammar-evidence-adapter-v2":
        raise ValueError("unexpected UD coverage adapter version")
    if coverage.get("evidenceDigest") != evidence.get("determinismDigest"):
        raise ValueError("UD coverage does not reference the evidence digest")

    rows: dict[str, dict[str, Any]] = {}
    for row in evidence.get("rows", []):
        if not isinstance(row, dict):
            raise ValueError("UD evidence row must be an object")
        text = row.get("text")
        if not isinstance(text, str) or not text or text in rows:
            raise ValueError("invalid or duplicate UD evidence text")
        rows[text] = row
    if set(rows) != candidate_set:
        raise ValueError("UD evidence rows do not equal candidate set")

    review_queue = coverage.get("reviewQueue")
    if not isinstance(review_queue, list):
        raise ValueError("UD reviewQueue must be a list")
    review_set = {row.get("text") for row in review_queue if isinstance(row, dict)}
    if None in review_set or not review_set.issubset(candidate_set):
        raise ValueError("UD review set is invalid")

    mixed_policy = coverage.get("reviewPolicy", {}).get("mixedUpos", {})
    min_count = mixed_policy.get("minimumCountPerCategory")
    min_share = mixed_policy.get("minimumOccurrenceSharePerCategory")
    if not isinstance(min_count, int) or min_count <= 0:
        raise ValueError("invalid UD significant-UPOS count threshold")
    if not isinstance(min_share, (int, float)) or not 0 < float(min_share) <= 1:
        raise ValueError("invalid UD significant-UPOS share threshold")
    return rows, review_set, min_count, float(min_share)


def eligible_dominant_upos(
    ud: dict[str, Any],
    significant_min_count: int,
    significant_min_share: float,
    min_occurrences: int,
) -> str | None:
    if ud.get("occurrenceCount", 0) < min_occurrences:
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


def build_heteronym_activations(
    *,
    candidates_path: Path,
    candidate_manifest_path: Path,
    cedict_projection_path: Path,
    ud_evidence_path: Path,
    ud_coverage_path: Path,
    active_words_path: Path,
    active_grammar_path: Path,
    min_occurrences: int,
) -> list[dict[str, Any]]:
    generation = load_candidate_set(candidates_path, candidate_manifest_path, require_manifest=True)
    candidate_set = set(generation.texts)

    active_words = load_csv(active_words_path, WORDS_FIELDS)
    active_grammar = load_csv(active_grammar_path, GRAMMAR_FIELDS)
    active_readings_by_text: dict[str, set[str]] = {}
    grammar_by_text: dict[str, set[tuple[str, str, str]]] = {}
    for row in active_words:
        active_readings_by_text.setdefault(row["text"], set()).add(row["reading"])
    for row in active_grammar:
        grammar_by_text.setdefault(row["text"], set()).add((
            row["roles"], row["predicate_frame"], row["standalone_kind"],
        ))

    ud_rows, ud_review, significant_min_count, significant_min_share = load_ud_v2(
        candidate_set,
        load_json(ud_evidence_path),
        load_json(ud_coverage_path),
    )
    ambiguous = load_ambiguous_cedict_records(cedict_projection_path)

    pinyin_to_convert: list[str] = []
    for text, records in ambiguous.items():
        if text not in candidate_set:
            continue
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
                ud, significant_min_count, significant_min_share, min_occurrences
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


def apply_activations(
    activations: list[dict[str, Any]],
    *,
    active_words_path: Path,
    active_grammar_path: Path,
    provenance_path: Path,
    manual_overrides_path: Path,
    active_concised_path: Path,
    active_revised_path: Path,
) -> None:
    words = load_csv(active_words_path, WORDS_FIELDS)
    grammar = load_csv(active_grammar_path, GRAMMAR_FIELDS)
    provenance = load_csv(provenance_path, PROVENANCE_FIELDS)
    manual = load_json(manual_overrides_path)

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

    atomic_write_lf(active_words_path, csv_text(words, WORDS_FIELDS))
    atomic_write_lf(active_grammar_path, csv_text(grammar, GRAMMAR_FIELDS))
    atomic_write_lf(provenance_path, csv_text(provenance, PROVENANCE_FIELDS))
    atomic_write_lf(
        manual_overrides_path,
        json.dumps(manual, ensure_ascii=False, indent=2) + "\n",
    )

    # Heteronym rows are added outside the normal review-batch/decision
    # pipeline (there is no 1-decision-per-text mapping for a text with
    # several active readings), so the MOE Concised/Revised active-catalog
    # projections' own candidate-scope bookkeeping needs a matching update
    # here, since no text here is resolved by either MOE authority.
    active_texts = {row["text"] for row in words}
    concised_payload = load_json(active_concised_path)
    concised = refresh_concised_scope(
        concised_payload, active_catalog_count=len(active_texts)
    )
    concised_output = json_text(concised)
    atomic_write_lf(active_concised_path, concised_output)
    concised_sha256 = sha256_text(concised_output)
    concised_texts = {
        str(row["lookupText"]) for row in projection_rows(concised, "activated Concised projection")
    }

    revised_payload = load_json(active_revised_path)
    revised = refresh_revised_scope(
        revised_payload,
        active_texts=active_texts,
        concised_texts=concised_texts,
        concised_sha256=concised_sha256,
    )
    atomic_write_lf(active_revised_path, json_text(revised))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--candidates", required=True, type=Path)
    parser.add_argument("--candidate-manifest", required=True, type=Path)
    parser.add_argument("--cedict-projection", required=True, type=Path)
    parser.add_argument("--ud-evidence", required=True, type=Path)
    parser.add_argument("--ud-coverage", required=True, type=Path)
    parser.add_argument("--active-catalog", default=DEFAULT_WORDS, type=Path)
    parser.add_argument("--grammar", default=DEFAULT_GRAMMAR, type=Path)
    parser.add_argument("--provenance", default=DEFAULT_PROVENANCE, type=Path)
    parser.add_argument("--manual-overrides", default=DEFAULT_MANUAL_OVERRIDES, type=Path)
    parser.add_argument("--active-concised", default=DEFAULT_ACTIVE_CONCISED, type=Path)
    parser.add_argument("--active-revised", default=DEFAULT_ACTIVE_REVISED, type=Path)
    parser.add_argument("--min-occurrences", default=DEFAULT_MIN_OCCURRENCES, type=int)
    parser.add_argument("--dry-run", action="store_true")
    arguments = parser.parse_args()

    activations = build_heteronym_activations(
        candidates_path=arguments.candidates,
        candidate_manifest_path=arguments.candidate_manifest,
        cedict_projection_path=arguments.cedict_projection,
        ud_evidence_path=arguments.ud_evidence,
        ud_coverage_path=arguments.ud_coverage,
        active_words_path=arguments.active_catalog,
        active_grammar_path=arguments.grammar,
        min_occurrences=arguments.min_occurrences,
    )
    total_readings = sum(len(activation["readings"]) for activation in activations)

    if arguments.dry_run:
        for activation in sorted(activations, key=lambda row: row["text"]):
            print(
                f"{activation['text']}: "
                f"{', '.join(activation['readings'])} "
                f"({activation['roles']}/{activation['predicate_frame']}/{activation['standalone_kind']})"
            )
        print(
            f"[dry run] would activate {len(activations)} heteronym texts with "
            f"{total_readings} total reading rows"
        )
        return

    apply_activations(
        activations,
        active_words_path=arguments.active_catalog,
        active_grammar_path=arguments.grammar,
        provenance_path=arguments.provenance,
        manual_overrides_path=arguments.manual_overrides,
        active_concised_path=arguments.active_concised,
        active_revised_path=arguments.active_revised,
    )
    print(
        f"activated {len(activations)} heteronym texts with "
        f"{total_readings} total reading rows"
    )


if __name__ == "__main__":
    main()

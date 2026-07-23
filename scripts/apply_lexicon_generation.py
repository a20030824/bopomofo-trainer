#!/usr/bin/env python3
"""Applies a manifest-linked lexicon generation to the active catalog.

This is a clean-replace apply step: it writes a brand new words.sample.csv
from a generation's activation report, discarding whatever was there
before. It does not merge with or preserve the previous active catalog --
that is a deliberate product decision the caller makes by choosing to run
this script, not a default.

Two sources of new entries:

1. Ordinary resolved-new-identity or already-active-exact-identity
   candidates whose text is "indexed" in the generation's formal-syntax
   rule index -- i.e. it already has a usable RuntimeSyntaxProfile and is
   guaranteed to survive `build-app-syntax-legality.ts`'s later legality
   gate. There is no separate grammar-role eligibility heuristic here: the
   rule index is the one gate that actually determines whether a word can
   be used to generate a sentence, so it is also the one gate applied here.
2. CC-CEDICT heteronyms with more than one distinct reading, activated with
   every distinct reading as its own entry (never picking one), reusing
   activate_cedict_heteronym_readings_generation's exact logic, gated by
   the same rule-index check.

Callers are responsible for reconciling any previously-active `(text,
reading)` identity that this run does not reproduce (e.g. because its text
fell outside the candidate generation's rank window) -- this script does
not know about identities outside the generation it was given.

Always preview with --dry-run first.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
SCRIPT_DIR = ROOT / "scripts"
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from activate_cedict_heteronym_readings_generation import (  # noqa: E402
    load_ambiguous_cedict_records,
)
from catalog_generation_policy import (  # noqa: E402
    DEFAULT_PROVENANCE,
    DEFAULT_WORDS,
    PROVENANCE_FIELDS,
    WORDS_FIELDS,
    atomic_write_lf,
    csv_text,
    load_json,
)
from lexicon_candidate_set import load_candidate_set  # noqa: E402

DEFAULT_MANUAL_OVERRIDES = ROOT / "data/readings/manual-reading-overrides.json"


def convert_numbered_pinyin_tolerant(values: list[str]) -> dict[str, str]:
    """Batch-convert numbered pinyin, silently dropping unconvertible values.

    catalog_generation_policy.convert_numbered_pinyin raises on the first
    failure in the whole batch, which is fine for small hand-picked lists
    but not for a 160k-candidate run: a single unsupported syllable (e.g. a
    bare erhua "r" final) must not abort every other heteronym in the
    batch. Same subprocess contract, tolerant per-item handling.
    """
    if not values:
        return {}
    result = subprocess.run(
        ["npx", "tsx", str(SCRIPT_DIR / "convert-numbered-pinyin.ts")],
        input=json.dumps(values),
        capture_output=True,
        text=True,
        encoding="utf-8",
        cwd=ROOT,
        shell=(os.name == "nt"),
        check=False,
    )
    if result.returncode != 0:
        raise ValueError(f"numbered pinyin conversion failed: {result.stderr}")
    payload = json.loads(result.stdout)
    converted: dict[str, str] = {}
    skipped = 0
    for value, item in zip(values, payload, strict=True):
        if isinstance(item, dict) and item.get("ok") and isinstance(item.get("reading"), str):
            converted[value] = item["reading"]
        else:
            skipped += 1
    if skipped:
        print(f"skipped {skipped} unconvertible numbered-pinyin value(s)")
    return converted


def unsupported_syllable_texts(activations: list[dict[str, Any]]) -> set[str]:
    """Flag readings using syllables outside the Stage 1 catalog syllable table.

    The UD/rule-index gate certifies grammar, not this project's own
    keyboard-scheme scope -- automated dictionary resolution can still
    produce a reading (e.g. an erhua-suffixed or onomatopoeia syllable)
    that compileCatalog() will later hard-reject. Catch it here, at apply
    time, with a clear reason, instead of a build-time crash.
    """
    if not activations:
        return set()
    readings = [row["reading"] for row in activations]
    result = subprocess.run(
        ["npx", "tsx", str(SCRIPT_DIR / "validate-reading-syllables.ts")],
        input=json.dumps(readings),
        capture_output=True,
        text=True,
        encoding="utf-8",
        cwd=ROOT,
        shell=(os.name == "nt"),
        check=False,
    )
    if result.returncode != 0:
        raise ValueError(f"reading syllable validation failed: {result.stderr}")
    payload = json.loads(result.stdout)
    unsupported: set[str] = set()
    for row, item in zip(activations, payload, strict=True):
        if not (isinstance(item, dict) and item.get("ok")):
            unsupported.add(row["text"])
    return unsupported


def load_activation_report(path: Path) -> dict[str, Any]:
    payload = load_json(path)
    if payload.get("adapterVersion") != "lexicon-activation-generation-v1":
        raise ValueError("unexpected activation report adapter version")
    return payload


def load_rule_index_status(path: Path) -> dict[str, str]:
    """Load the formal-syntax rule index's per-text status.

    This is the one gate that determines whether a word can actually be
    used to generate a sentence (build-lexicon-syntax-generation.ts /
    build-app-syntax-legality.ts), so it replaces the old grammar-role
    eligibility heuristic as the sole apply-time filter.
    """
    payload = load_json(path)
    if payload.get("schemaVersion") != "formal-syntax-rule-index-v1":
        raise ValueError("unexpected syntax rule index schema version")
    status_by_text: dict[str, str] = {}
    for entry in payload.get("entries", []):
        text = entry.get("text")
        status = entry.get("status")
        if not isinstance(text, str) or not text or not isinstance(status, str):
            raise ValueError("syntax rule index entry is missing text or status")
        if text in status_by_text:
            raise ValueError(f"syntax rule index contains duplicate written form: {text}")
        status_by_text[text] = status
    return status_by_text


def build_ordinary_activations(
    report: dict[str, Any],
    rule_index_status: dict[str, str],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    included: list[dict[str, Any]] = []
    excluded: list[dict[str, Any]] = []
    for row in report["rows"]:
        text = row["text"]
        if row["status"] not in ("resolved-new-identity", "already-active-exact-identity"):
            excluded.append({"text": text, "reason": row["status"]})
            continue
        status = rule_index_status.get(text)
        if status != "indexed":
            excluded.append({"text": text, "reason": status or "not-in-rule-index"})
            continue
        included.append({"text": text, "reading": row["reading"]["evidence"]})
    return included, excluded


def build_heteronym_activations(
    cedict_projection_path: Path,
    candidate_set: set[str],
    rule_index_status: dict[str, str],
    already_included_texts: set[str],
) -> list[dict[str, Any]]:
    ambiguous = load_ambiguous_cedict_records(cedict_projection_path)
    pinyin_to_convert: list[str] = []
    for text, records in ambiguous.items():
        if text not in candidate_set or text in already_included_texts:
            continue
        for record in records:
            pinyin_to_convert.append(record["pinyin"])
    converted = convert_numbered_pinyin_tolerant(pinyin_to_convert)

    activations: list[dict[str, Any]] = []
    for text in sorted(ambiguous):
        if text not in candidate_set or text in already_included_texts:
            continue
        if rule_index_status.get(text) != "indexed":
            continue
        records = [r for r in ambiguous[text] if r["pinyin"] in converted]
        if not records:
            continue
        readings = sorted({converted[record["pinyin"]] for record in records})
        for reading in readings:
            activations.append({"text": text, "reading": reading})
    return activations


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--candidates", required=True, type=Path)
    parser.add_argument("--candidate-manifest", required=True, type=Path)
    parser.add_argument("--activation-report", required=True, type=Path)
    parser.add_argument("--cedict-projection", required=True, type=Path)
    parser.add_argument("--rule-index", required=True, type=Path)
    parser.add_argument("--words", default=DEFAULT_WORDS, type=Path)
    parser.add_argument("--provenance", default=DEFAULT_PROVENANCE, type=Path)
    parser.add_argument("--manual-overrides", default=DEFAULT_MANUAL_OVERRIDES, type=Path)
    parser.add_argument("--provenance-id", required=True)
    parser.add_argument("--provenance-title", required=True)
    parser.add_argument("--dry-run", action="store_true")
    arguments = parser.parse_args()

    generation = load_candidate_set(arguments.candidates, arguments.candidate_manifest, require_manifest=True)
    candidate_set = set(generation.texts)
    report = load_activation_report(arguments.activation_report)
    rule_index_status = load_rule_index_status(arguments.rule_index)

    ordinary, excluded = build_ordinary_activations(report, rule_index_status)
    ordinary_texts = {row["text"] for row in ordinary}
    heteronyms = build_heteronym_activations(
        arguments.cedict_projection,
        candidate_set,
        rule_index_status,
        ordinary_texts,
    )
    activations = ordinary + heteronyms

    unsupported_texts = unsupported_syllable_texts(activations)
    if unsupported_texts:
        for row in activations:
            if row["text"] in unsupported_texts:
                excluded.append({"text": row["text"], "reason": "unsupported-syllable"})
        activations = [row for row in activations if row["text"] not in unsupported_texts]

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
    atomic_write_lf(arguments.words, csv_text(words_rows, WORDS_FIELDS))

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
                "Inclusion is gated solely by the formal-syntax rule index (indexed "
                "status); no human review, no legacy grammar-role heuristic."
            ),
        })
    atomic_write_lf(arguments.provenance, csv_text(provenance, PROVENANCE_FIELDS))
    print(f"wrote {len(activations)} rows to {arguments.words}")


def _read_provenance(path: Path) -> list[dict[str, str]]:
    import csv

    with path.open("r", encoding="utf-8-sig", newline="") as source:
        return list(csv.DictReader(source))


if __name__ == "__main__":
    main()

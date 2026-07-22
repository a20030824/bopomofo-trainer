#!/usr/bin/env python3
"""Auto-classify a screened activation-review batch using a statistical rule.

This replaces per-word manual grammar review with a fixed heuristic over the
UD evidence already computed for each candidate: whenever the lane's
dominant UPOS tag maps to a usable existing-schema role, it is approved;
anything that doesn't fit any lane is held (never force-approved). This is a
maximize-volume rule, not a precision rule -- it approves on the weakest
signal that still has a chance of being right, and accepts a materially
higher, unmeasured error rate on the words it approves than a stricter
supermajority rule would. There is no follow-up pass planned to catch
misclassifications.
"""

from __future__ import annotations

import csv
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from validate_activation_review_decisions import DECISION_FIELDS  # noqa: E402

BATCH_FIELDS = [
    "batch_order",
    "general_rank",
    "text",
    "reading_authority",
    "reading_evidence_type",
    "reading_evidence",
    "review_lane",
    "occurrence_count",
    "dominant_upos",
    "upos_counts",
    "dependency_relation_counts",
    "root_count",
    "verb_object_frame",
    "review_status",
]

TMOD_SHARE_MIN = 0.3

AUTO_RATIONALE = "Automatically approved by statistical heuristic; not manually reviewed"
HELD_RATIONALE = "held-auto-unclassified"


def parse_counts(value: str) -> dict[str, int]:
    result: dict[str, int] = {}
    if not value:
        return result
    for part in value.split(";"):
        key, count = part.split("=")
        result[key] = int(count)
    return result


def load_batch(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as source:
        reader = csv.DictReader(source)
        if reader.fieldnames != BATCH_FIELDS:
            raise ValueError(f"unexpected batch fields: {reader.fieldnames!r}")
        return [dict(row) for row in reader]


def classify(row: dict[str, str]) -> tuple[str, str, str, str, str]:
    """Returns (decision, roles, predicate_frame, standalone_kind, rationale).

    Approves whenever the lane's dominant UPOS tag gives *any* usable
    grammatical role, rather than requiring a strong supermajority share or a
    trainer-Bopomofo reading. Non-Bopomofo (CC-CEDICT numbered-pinyin)
    readings are approved too: the catalog build already converts these
    automatically via ``numberedPinyinToTrainerReading`` for every active
    CC-CEDICT-sourced word, so holding them here would just be redundant
    caution, not a real gate.
    """
    lane = row["review_lane"]

    def held(reason: str) -> tuple[str, str, str, str, str]:
        return ("held-context-dependent", "", "", "", reason)

    upos = row["dominant_upos"]
    occurrence = int(row["occurrence_count"])
    deps = parse_counts(row["dependency_relation_counts"])

    if lane == "nominal-evidence":
        if upos not in ("NOUN", "PROPN", "PRON"):
            return held(HELD_RATIONALE)
        tmod_share = deps.get("nmod:tmod", 0) / occurrence if occurrence else 0.0
        if tmod_share >= TMOD_SHARE_MIN:
            return ("approved-existing-schema", "temporal", "none", "lexical-prompt", AUTO_RATIONALE)
        return ("approved-existing-schema", "subject;object", "none", "lexical-prompt", AUTO_RATIONALE)

    if lane == "verbal-evidence":
        if upos != "VERB":
            return held(HELD_RATIONALE)
        frame = row["verb_object_frame"]
        if frame == "object-bearing-only":
            return (
                "approved-existing-schema", "transitive-predicate", "transitive",
                "lexical-prompt", AUTO_RATIONALE,
            )
        if frame == "objectless-only":
            return (
                "approved-existing-schema", "intransitive-predicate", "intransitive",
                "lexical-prompt", AUTO_RATIONALE,
            )
        return (
            "approved-existing-schema",
            "object;intransitive-predicate;transitive-predicate;verb",
            "ambitransitive",
            "lexical-prompt",
            AUTO_RATIONALE,
        )

    if lane == "adjectival-evidence":
        if upos == "ADJ":
            return (
                "approved-existing-schema", "adjectival-predicate", "adjectival",
                "lexical-prompt", AUTO_RATIONALE,
            )
        return held(HELD_RATIONALE)

    if lane == "auxiliary-evidence":
        if upos == "AUX":
            return ("approved-existing-schema", "modal", "modal", "lexical-prompt", AUTO_RATIONALE)
        return held(HELD_RATIONALE)

    return held(HELD_RATIONALE)


def load_previously_held_texts() -> set[str]:
    """Words a human already explicitly held in batch 1. These can resurface
    as eligible again (held candidates are never activated), but an existing
    human decision always overrides the blind statistical rule.
    """
    held: set[str] = set()
    for name in (
        "naer-activation-review-batch-1-decisions-1-25.csv",
        "naer-activation-review-batch-1-decisions-26-50.csv",
        "naer-activation-review-batch-1-decisions-51-100.csv",
    ):
        path = ROOT / "data" / "grammar" / name
        with path.open("r", encoding="utf-8-sig", newline="") as source:
            for row in csv.DictReader(source):
                if row["decision"] != "approved-existing-schema":
                    held.add(row["text"])
    return held


def build_decisions(batch_rows: list[dict[str, str]]) -> list[dict[str, str]]:
    previously_held = load_previously_held_texts()
    decisions = []
    for row in batch_rows:
        if row["text"] in previously_held:
            decision, roles, frame, standalone, rationale = (
                "held-context-dependent", "", "", "",
                "Previously held by manual review in batch 1; a human decision "
                "always overrides the automatic rule",
            )
        else:
            decision, roles, frame, standalone, rationale = classify(row)
        decisions.append({
            "batch_order": row["batch_order"],
            "general_rank": row["general_rank"],
            "text": row["text"],
            "reading_authority": row["reading_authority"],
            "reading_evidence_type": row["reading_evidence_type"],
            "reading_evidence": row["reading_evidence"],
            "decision": decision,
            "roles": roles,
            "predicate_frame": frame,
            "standalone_kind": standalone,
            "rationale": rationale,
        })
    return decisions


def write_decisions(path: Path, decisions: list[dict[str, str]]) -> None:
    with path.open("w", encoding="utf-8", newline="\n") as destination:
        writer = csv.DictWriter(destination, fieldnames=DECISION_FIELDS, lineterminator="\n")
        writer.writeheader()
        writer.writerows(decisions)


def main() -> None:
    batch_path = ROOT / "data/grammar/naer-top-1000-activation-review-batch-2.csv"
    decisions_path = ROOT / "data/grammar/naer-activation-review-batch-2-decisions-auto.csv"
    batch_rows = load_batch(batch_path)
    decisions = build_decisions(batch_rows)
    write_decisions(decisions_path, decisions)
    approved = sum(1 for row in decisions if row["decision"] == "approved-existing-schema")
    print(f"classified {len(decisions)} candidates: {approved} approved, {len(decisions) - approved} held")


if __name__ == "__main__":
    main()

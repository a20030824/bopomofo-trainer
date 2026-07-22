#!/usr/bin/env python3
"""Validate the first hand-reviewed NAER activation decisions."""

from __future__ import annotations

import csv
import hashlib
import json
from collections import Counter
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_BATCH = ROOT / "data/grammar/naer-top-1000-activation-review-batch-1.csv"
DEFAULT_REPORT = ROOT / "data/grammar/naer-top-1000-activation-review-batch-1-report.json"
DEFAULT_DECISIONS = ROOT / "data/grammar/naer-activation-review-batch-1-decisions-1-25.csv"

EXPECTED_REPORT_DIGEST = "bfd7022c957ac03e4263843753b2979b5e6d8c09ff54e1c55302b59404c19d4b"
EXPECTED_DECISION_DIGEST = "1e0198d15281bceb0b47a9b45064025bb747153a49acf1bde8ca7115d5d78e53"
EXPECTED_TEXTS = [
    "我", "他", "你", "她", "它", "讓", "年", "自己", "他們", "被",
    "什麼", "時候", "等", "次", "覺得", "天", "月", "一些", "元", "地方",
    "孩子", "裡面", "一樣", "不會", "歲",
]
ALLOWED_DECISIONS = {
    "approved-existing-schema",
    "held-template-gap",
    "held-lexical-ambiguity",
    "held-context-dependent",
}
ALLOWED_ROLES = {
    "subject",
    "object",
    "temporal",
    "intransitive-predicate",
    "transitive-predicate",
    "verb",
    "modal",
    "adverbial",
    "adjectival-predicate",
    "formulaic",
}
ALLOWED_FRAMES = {
    "none", "intransitive", "transitive", "ambitransitive", "modal", "adjectival"
}
ALLOWED_STANDALONE = {"none", "lexical-prompt", "utterance"}

IDENTITY_FIELDS = [
    "batch_order",
    "general_rank",
    "text",
    "reading_authority",
    "reading_evidence_type",
    "reading_evidence",
]
DECISION_FIELDS = [
    *IDENTITY_FIELDS,
    "decision",
    "roles",
    "predicate_frame",
    "standalone_kind",
    "rationale",
]
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


def canonical_digest(value: Any) -> str:
    payload = json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def load_csv(path: Path, expected_fields: list[str]) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as source:
        reader = csv.DictReader(source)
        if reader.fieldnames != expected_fields:
            raise ValueError(
                f"{path} fields must equal {expected_fields!r}; got {reader.fieldnames!r}"
            )
        return [
            {field: (row.get(field) or "").strip() for field in expected_fields}
            for row in reader
        ]


def load_report(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError("activation review report must be an object")
    if payload.get("adapterVersion") != "naer-activation-review-batch-v1":
        raise ValueError("unexpected activation review adapter version")
    if payload.get("determinismDigest") != EXPECTED_REPORT_DIGEST:
        raise ValueError("activation review report digest drift")
    selected = payload.get("selectedTexts")
    if not isinstance(selected, list) or selected[:25] != EXPECTED_TEXTS:
        raise ValueError("activation review report first 25 texts drift")
    return payload


def parse_roles(value: str) -> list[str]:
    if not value:
        return []
    roles = value.split(";")
    if any(not role for role in roles) or len(set(roles)) != len(roles):
        raise ValueError(f"invalid role list: {value!r}")
    unknown = set(roles) - ALLOWED_ROLES
    if unknown:
        raise ValueError(f"unknown roles: {sorted(unknown)!r}")
    return roles


def validate_approved(row: dict[str, str]) -> None:
    roles = parse_roles(row["roles"])
    frame = row["predicate_frame"]
    standalone = row["standalone_kind"]
    if not roles:
        raise ValueError(f"approved row has no roles: {row['text']}")
    if frame not in ALLOWED_FRAMES:
        raise ValueError(f"approved row has invalid frame: {row['text']}")
    if standalone not in ALLOWED_STANDALONE:
        raise ValueError(f"approved row has invalid standalone kind: {row['text']}")
    if frame == "none":
        if set(roles) - {"subject", "object", "temporal", "adverbial"}:
            raise ValueError(f"none-frame row has predicate role: {row['text']}")
    elif frame == "modal":
        if roles != ["modal"]:
            raise ValueError(f"modal frame requires only modal role: {row['text']}")
    elif frame == "adjectival":
        if roles != ["adjectival-predicate"]:
            raise ValueError(
                f"adjectival frame requires adjectival-predicate: {row['text']}"
            )
    else:
        raise ValueError(
            f"first review slice does not approve verbal predicate frames: {row['text']}"
        )
    if standalone != "lexical-prompt":
        raise ValueError(
            f"approved first-slice row must be lexical-prompt: {row['text']}"
        )


def validate_held(row: dict[str, str]) -> None:
    if row["roles"] or row["predicate_frame"] or row["standalone_kind"]:
        raise ValueError(f"held row contains latent grammar annotation: {row['text']}")


def validate_files(
    batch_path: Path = DEFAULT_BATCH,
    report_path: Path = DEFAULT_REPORT,
    decisions_path: Path = DEFAULT_DECISIONS,
) -> dict[str, Any]:
    load_report(report_path)
    batch_rows = load_csv(batch_path, BATCH_FIELDS)
    if len(batch_rows) != 100:
        raise ValueError("activation review batch must contain 100 rows")
    first_rows = batch_rows[:25]
    if [row["text"] for row in first_rows] != EXPECTED_TEXTS:
        raise ValueError("activation review CSV first 25 texts drift")

    decisions = load_csv(decisions_path, DECISION_FIELDS)
    if len(decisions) != 25:
        raise ValueError("decision sidecar must contain exactly 25 rows")
    if [row["batch_order"] for row in decisions] != [
        str(index) for index in range(1, 26)
    ]:
        raise ValueError("decision batch_order must be continuous 1..25")
    if len({row["text"] for row in decisions}) != 25:
        raise ValueError("decision texts must be unique")

    for source, decision in zip(first_rows, decisions, strict=True):
        for field in IDENTITY_FIELDS:
            if source[field] != decision[field]:
                raise ValueError(
                    f"decision identity mismatch for "
                    f"{decision['text'] or source['text']}: {field}"
                )
        if decision["decision"] not in ALLOWED_DECISIONS:
            raise ValueError(f"unsupported decision: {decision['decision']!r}")
        if not decision["rationale"]:
            raise ValueError(f"missing rationale: {decision['text']}")
        if decision["decision"] == "approved-existing-schema":
            validate_approved(decision)
        else:
            validate_held(decision)

    counts = Counter(row["decision"] for row in decisions)
    if counts["approved-existing-schema"] != 11:
        raise ValueError("first review slice must approve exactly 11 rows")
    held_count = sum(
        count for key, count in counts.items() if key != "approved-existing-schema"
    )
    if held_count != 14:
        raise ValueError("first review slice must hold exactly 14 rows")

    digest = canonical_digest(decisions)
    if digest != EXPECTED_DECISION_DIGEST:
        raise ValueError(f"decision digest drift: {digest}")

    return {
        "reviewedCount": len(decisions),
        "approvedCount": counts["approved-existing-schema"],
        "heldCount": held_count,
        "decisionCounts": dict(sorted(counts.items())),
        "determinismDigest": digest,
    }


def main() -> None:
    result = validate_files()
    print(
        f"validated {result['reviewedCount']} decisions; "
        f"{result['approvedCount']} approved; {result['heldCount']} held; "
        f"digest {result['determinismDigest']}"
    )


if __name__ == "__main__":
    main()

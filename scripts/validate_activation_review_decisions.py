#!/usr/bin/env python3
"""Validate committed hand-reviewed NAER activation decision slices."""

from __future__ import annotations

import csv
import hashlib
import json
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_BATCH = ROOT / "data/grammar/naer-top-1000-activation-review-batch-1.csv"
DEFAULT_REPORT = ROOT / "data/grammar/naer-top-1000-activation-review-batch-1-report.json"
DEFAULT_DECISIONS = ROOT / "data/grammar/naer-activation-review-batch-1-decisions-1-25.csv"
SECOND_DECISIONS = ROOT / "data/grammar/naer-activation-review-batch-1-decisions-26-50.csv"

EXPECTED_REPORT_DIGEST = "bfd7022c957ac03e4263843753b2979b5e6d8c09ff54e1c55302b59404c19d4b"
EXPECTED_DECISION_DIGEST = "1e0198d15281bceb0b47a9b45064025bb747153a49acf1bde8ca7115d5d78e53"
SECOND_EXPECTED_DECISION_DIGEST = "5cf787b91d5dcaaa4a81cd13393e9fdaaf1be8a8c1a399e3525405b21e469743"
EXPECTED_TEXTS = [
    "我", "他", "你", "她", "它", "讓", "年", "自己", "他們", "被",
    "什麼", "時候", "等", "次", "覺得", "天", "月", "一些", "元", "地方",
    "孩子", "裡面", "一樣", "不會", "歲",
]
SECOND_EXPECTED_TEXTS = [
    "名", "認為", "重要", "美國", "其", "中國", "政府", "社會", "世界", "活動",
    "公司", "民眾", "不同", "關係", "能夠", "不能", "事情", "最後", "國家", "方式",
    "必須", "件", "請", "走", "環境",
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


@dataclass(frozen=True)
class ReviewSlice:
    name: str
    first_order: int
    last_order: int
    decisions_path: Path
    expected_texts: tuple[str, ...]
    expected_digest: str
    expected_approved: int
    expected_held: int


FIRST_REVIEW_SLICE = ReviewSlice(
    name="orders-1-25",
    first_order=1,
    last_order=25,
    decisions_path=DEFAULT_DECISIONS,
    expected_texts=tuple(EXPECTED_TEXTS),
    expected_digest=EXPECTED_DECISION_DIGEST,
    expected_approved=11,
    expected_held=14,
)
SECOND_REVIEW_SLICE = ReviewSlice(
    name="orders-26-50",
    first_order=26,
    last_order=50,
    decisions_path=SECOND_DECISIONS,
    expected_texts=tuple(SECOND_EXPECTED_TEXTS),
    expected_digest=SECOND_EXPECTED_DECISION_DIGEST,
    expected_approved=20,
    expected_held=5,
)
REVIEW_SLICES = (FIRST_REVIEW_SLICE, SECOND_REVIEW_SLICE)


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
    elif frame == "intransitive":
        if roles != ["intransitive-predicate"]:
            raise ValueError(
                f"intransitive frame requires intransitive-predicate: {row['text']}"
            )
    else:
        raise ValueError(
            f"reviewed slices do not approve this predicate frame: {row['text']}"
        )
    if standalone != "lexical-prompt":
        raise ValueError(
            f"approved review row must be lexical-prompt: {row['text']}"
        )


def validate_held(row: dict[str, str]) -> None:
    if row["roles"] or row["predicate_frame"] or row["standalone_kind"]:
        raise ValueError(f"held row contains latent grammar annotation: {row['text']}")


def load_locked_inputs(
    batch_path: Path,
    report_path: Path,
) -> tuple[list[dict[str, str]], dict[str, Any]]:
    report = load_report(report_path)
    batch_rows = load_csv(batch_path, BATCH_FIELDS)
    if len(batch_rows) != 100:
        raise ValueError("activation review batch must contain 100 rows")
    selected = report.get("selectedTexts")
    if not isinstance(selected, list) or selected != [row["text"] for row in batch_rows]:
        raise ValueError("activation review report and CSV identity order drift")
    return batch_rows, report


def validate_review_slice(
    batch_rows: list[dict[str, str]],
    review_slice: ReviewSlice,
    decisions_path: Path | None = None,
) -> dict[str, Any]:
    first_index = review_slice.first_order - 1
    source_rows = batch_rows[first_index:review_slice.last_order]
    if [row["text"] for row in source_rows] != list(review_slice.expected_texts):
        raise ValueError(f"activation review CSV {review_slice.name} texts drift")

    decisions = load_csv(decisions_path or review_slice.decisions_path, DECISION_FIELDS)
    expected_count = review_slice.last_order - review_slice.first_order + 1
    if len(decisions) != expected_count:
        raise ValueError(
            f"decision sidecar {review_slice.name} must contain exactly {expected_count} rows"
        )
    if [row["batch_order"] for row in decisions] != [
        str(index) for index in range(review_slice.first_order, review_slice.last_order + 1)
    ]:
        raise ValueError(
            f"decision batch_order must be continuous "
            f"{review_slice.first_order}..{review_slice.last_order}"
        )
    if len({row["text"] for row in decisions}) != expected_count:
        raise ValueError(f"decision texts must be unique in {review_slice.name}")

    for source, decision in zip(source_rows, decisions, strict=True):
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
    approved_count = counts["approved-existing-schema"]
    held_count = len(decisions) - approved_count
    if approved_count != review_slice.expected_approved:
        raise ValueError(
            f"{review_slice.name} must approve exactly {review_slice.expected_approved} rows"
        )
    if held_count != review_slice.expected_held:
        raise ValueError(
            f"{review_slice.name} must hold exactly {review_slice.expected_held} rows"
        )

    digest = canonical_digest(decisions)
    if digest != review_slice.expected_digest:
        raise ValueError(f"decision digest drift for {review_slice.name}: {digest}")

    return {
        "name": review_slice.name,
        "firstOrder": review_slice.first_order,
        "lastOrder": review_slice.last_order,
        "reviewedCount": len(decisions),
        "approvedCount": approved_count,
        "heldCount": held_count,
        "decisionCounts": dict(sorted(counts.items())),
        "determinismDigest": digest,
    }


def validate_files(
    batch_path: Path = DEFAULT_BATCH,
    report_path: Path = DEFAULT_REPORT,
    decisions_path: Path = DEFAULT_DECISIONS,
) -> dict[str, Any]:
    """Validate the first slice; kept stable for the activation-1 migration."""
    batch_rows, _ = load_locked_inputs(batch_path, report_path)
    return validate_review_slice(batch_rows, FIRST_REVIEW_SLICE, decisions_path)


def validate_second_files(
    batch_path: Path = DEFAULT_BATCH,
    report_path: Path = DEFAULT_REPORT,
    decisions_path: Path = SECOND_DECISIONS,
) -> dict[str, Any]:
    batch_rows, _ = load_locked_inputs(batch_path, report_path)
    return validate_review_slice(batch_rows, SECOND_REVIEW_SLICE, decisions_path)


def validate_all_files(
    batch_path: Path = DEFAULT_BATCH,
    report_path: Path = DEFAULT_REPORT,
) -> dict[str, Any]:
    batch_rows, _ = load_locked_inputs(batch_path, report_path)
    slices = [validate_review_slice(batch_rows, item) for item in REVIEW_SLICES]
    return {
        "reviewedCount": sum(item["reviewedCount"] for item in slices),
        "approvedCount": sum(item["approvedCount"] for item in slices),
        "heldCount": sum(item["heldCount"] for item in slices),
        "slices": slices,
    }


def main() -> None:
    result = validate_all_files()
    print(
        f"validated {result['reviewedCount']} decisions; "
        f"{result['approvedCount']} approved; {result['heldCount']} held"
    )
    for item in result["slices"]:
        print(
            f"{item['name']}: {item['approvedCount']} approved; "
            f"{item['heldCount']} held; digest {item['determinismDigest']}"
        )


if __name__ == "__main__":
    main()

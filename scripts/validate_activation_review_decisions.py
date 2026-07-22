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
THIRD_DECISIONS = ROOT / "data/grammar/naer-activation-review-batch-1-decisions-51-100.csv"
BATCH2_PATH = ROOT / "data/grammar/naer-top-1000-activation-review-batch-2.csv"
BATCH2_REPORT_PATH = ROOT / "data/grammar/naer-top-1000-activation-review-batch-2-report.json"
BATCH2_DECISIONS = ROOT / "data/grammar/naer-activation-review-batch-2-decisions-auto.csv"

EXPECTED_REPORT_DIGEST = "bfd7022c957ac03e4263843753b2979b5e6d8c09ff54e1c55302b59404c19d4b"
EXPECTED_DECISION_DIGEST = "1e0198d15281bceb0b47a9b45064025bb747153a49acf1bde8ca7115d5d78e53"
SECOND_EXPECTED_DECISION_DIGEST = "5cf787b91d5dcaaa4a81cd13393e9fdaaf1be8a8c1a399e3525405b21e469743"
THIRD_EXPECTED_DECISION_DIGEST = "ac83f086ff4a1ed7dea989079d41215a19846845296c347b337533d0a79ce0b2"
EXPECTED_BATCH2_REPORT_DIGEST = "c1577127b983332c06eb08df85ea511fad732317239fd964aa611da49b157d7b"
BATCH2_EXPECTED_DECISION_DIGEST = "b6012460ca6b803c6c4ee5dbfb686af818139c90419779777fae151d51779aa1"
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
THIRD_EXPECTED_TEXTS = [
    "文化", "大陸", "大學", "目前", "部分", "無法", "日本", "未來", "學校", "經濟",
    "當時", "過程", "感覺", "結果", "指出", "後來", "機會", "條", "放", "故事",
    "變成", "其中", "先生", "同時", "使", "決定", "市場", "中心", "國際", "狀況",
    "身體", "項", "生命", "起來", "誰", "歷史", "電影", "人員", "隻", "令",
    "家庭", "經驗", "是否", "塊", "能力", "小時", "政治", "企業", "總統", "進入",
]
BATCH2_EXPECTED_TEXTS = [
    "讓", "年", "被", "什麼", "時候", "等", "次", "覺得", "天", "月",
    "一些", "元", "裡面", "歲", "名", "認為", "其", "件", "請", "無法",
    "指出", "條", "放", "其中", "使", "決定", "國際", "項", "起來", "誰",
    "隻", "令", "是否", "塊", "小時", "美", "情況", "醫院", "如此", "社區",
    "作品", "藝術", "父親", "地區", "方面", "空間", "久", "臺灣", "產業", "辦法",
    "事實", "精神", "住", "醫師", "政策", "得到", "出來", "知", "原因", "時代",
    "母親", "土地", "現場", "父母", "基本", "全球", "真正", "行為", "分鐘", "不少",
    "人類", "產品", "資源", "力量", "技術", "食物", "目標", "壓力", "年輕", "回到",
    "音樂", "中央", "當中", "價值", "事件", "動物", "意義", "網路", "媒體", "歡迎",
    "意思", "推動", "擔任", "份", "家人", "遭", "當地", "實際", "鼓勵", "科技",
    "內容", "穿", "單位", "顆", "觀眾", "功能", "城市", "來到", "加入", "女性",
    "情緒", "期間", "動作", "教授", "態度", "角色", "代", "叫做", "她們", "針對",
    "香港", "銀行", "感到", "長期", "英國", "博士", "男", "團體", "比賽", "下午",
    "節目", "生態", "植物", "知識", "附近", "科學", "具有", "人民", "公園", "主義",
    "人們", "資訊", "需求", "情形", "效果", "報告", "公尺", "具", "新聞", "前往",
    "品牌", "概念", "方向", "課程", "現象", "協會", "積極", "醫生", "步", "人士",
    "它們", "電視", "醫療", "居民", "會議", "系列", "階段", "等等", "員工", "電話",
    "時期", "那樣", "屆", "北京", "人物", "那裡", "專家", "畢業", "倍", "唯一",
    "部落", "特色", "基礎", "米", "國內", "程度", "興趣", "北", "心理", "條件",
    "影片", "空氣", "申請", "公里", "結構", "位置", "遊戲", "進", "校長", "如今",
    "責任", "下來", "農業", "永遠", "集團", "黑", "呈現", "主題", "豐富", "狗",
    "目的", "信",
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
THIRD_REVIEW_SLICE = ReviewSlice(
    name="orders-51-100",
    first_order=51,
    last_order=100,
    decisions_path=THIRD_DECISIONS,
    expected_texts=tuple(THIRD_EXPECTED_TEXTS),
    expected_digest=THIRD_EXPECTED_DECISION_DIGEST,
    expected_approved=34,
    expected_held=16,
)
REVIEW_SLICES = (FIRST_REVIEW_SLICE, SECOND_REVIEW_SLICE, THIRD_REVIEW_SLICE)

BATCH2_REVIEW_SLICE = ReviewSlice(
    name="batch-2-auto",
    first_order=1,
    last_order=212,
    decisions_path=BATCH2_DECISIONS,
    expected_texts=tuple(BATCH2_EXPECTED_TEXTS),
    expected_digest=BATCH2_EXPECTED_DECISION_DIGEST,
    expected_approved=177,
    expected_held=35,
)


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


def load_report(
    path: Path,
    expected_digest: str = EXPECTED_REPORT_DIGEST,
) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError("activation review report must be an object")
    if payload.get("adapterVersion") != "naer-activation-review-batch-v1":
        raise ValueError("unexpected activation review adapter version")
    if payload.get("determinismDigest") != expected_digest:
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
    elif frame == "transitive":
        if roles != ["transitive-predicate"]:
            raise ValueError(
                f"transitive frame requires transitive-predicate: {row['text']}"
            )
    elif frame == "ambitransitive":
        if roles != ["object", "intransitive-predicate", "transitive-predicate", "verb"]:
            raise ValueError(
                f"ambitransitive frame requires object;intransitive-predicate;"
                f"transitive-predicate;verb: {row['text']}"
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
    *,
    expected_row_count: int = 100,
    expected_report_digest: str = EXPECTED_REPORT_DIGEST,
) -> tuple[list[dict[str, str]], dict[str, Any]]:
    report = load_report(report_path, expected_report_digest)
    batch_rows = load_csv(batch_path, BATCH_FIELDS)
    if len(batch_rows) != expected_row_count:
        raise ValueError(f"activation review batch must contain {expected_row_count} rows")
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


def validate_third_files(
    batch_path: Path = DEFAULT_BATCH,
    report_path: Path = DEFAULT_REPORT,
    decisions_path: Path = THIRD_DECISIONS,
) -> dict[str, Any]:
    batch_rows, _ = load_locked_inputs(batch_path, report_path)
    return validate_review_slice(batch_rows, THIRD_REVIEW_SLICE, decisions_path)


def validate_batch2_files(
    batch_path: Path = BATCH2_PATH,
    report_path: Path = BATCH2_REPORT_PATH,
    decisions_path: Path = BATCH2_DECISIONS,
) -> dict[str, Any]:
    """Batch 2 is a separate, larger, auto-classified batch (see
    scripts/auto_classify_activation_batch.py) rather than a hand-reviewed
    slice of batch 1, so it is validated against its own locked report/digest
    instead of the shared 100-row batch-1 lock.
    """
    batch_rows, _ = load_locked_inputs(
        batch_path,
        report_path,
        expected_row_count=212,
        expected_report_digest=EXPECTED_BATCH2_REPORT_DIGEST,
    )
    return validate_review_slice(batch_rows, BATCH2_REVIEW_SLICE, decisions_path)


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

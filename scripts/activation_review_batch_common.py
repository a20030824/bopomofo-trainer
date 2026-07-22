from __future__ import annotations

import csv
import hashlib
import json
from collections import Counter
from pathlib import Path
from typing import Any, Mapping

ADAPTER_VERSION = "naer-activation-review-batch-v1"
EXPECTED_CANDIDATE_COUNT = 1_000
EXPECTED_ACTIVE_CATALOG_COUNT = 49
EXPECTED_READING_COVERAGE_DIGEST = "c85651b20a7feeef0ae91d1cd690bf4444e61d546f768c3450e27b085b434403"
EXPECTED_READING_REVIEW_COUNT = 89
EXPECTED_UD_EVIDENCE_DIGEST = "4e8449e14ef62ef683a8edc3da8085c47a391a29540c72e30419e51f8ad76459"
EXPECTED_UD_COVERAGE_DIGEST = "53f2259bf725732f652c237955350a1365029ef0a6ec48321fee2bc5bcb8e391"
EXPECTED_UD_REVIEW_COUNT = 403
DEFAULT_BATCH_SIZE = 100
DEFAULT_MIN_OCCURRENCES = 5

DEFAULT_CANDIDATES = Path("data/lexicon/naer-1141208-top-1000-candidates.csv")
DEFAULT_READING_COVERAGE = Path("data/lexicon/naer-1141208-top-1000-reading-coverage.json")
DEFAULT_CONCISED = Path("data/readings/moe-concised-2014_20260626-naer-top-1000.json")
DEFAULT_REVISED = Path("data/readings/moe-revised-2015_20260625-naer-top-1000-fallback.json")
DEFAULT_CEDICT = Path("data/identity/cedict-2026-07-21-naer-top-1000-hints.json")
DEFAULT_UD_EVIDENCE = Path("data/grammar/ud-chinese-gsd-r2.18-naer-top-1000-evidence.json")
DEFAULT_UD_COVERAGE = Path("data/grammar/ud-chinese-gsd-r2.18-naer-top-1000-coverage.json")
DEFAULT_ACTIVE_CATALOG = Path("data/source/words.sample.csv")
DEFAULT_BATCH_OUTPUT = Path("data/grammar/naer-top-1000-activation-review-batch-1.csv")
DEFAULT_REPORT_OUTPUT = Path("data/grammar/naer-top-1000-activation-review-batch-1-report.json")

REVIEW_LANES: Mapping[str, str] = {
    "NOUN": "nominal-evidence",
    "PROPN": "nominal-evidence",
    "PRON": "nominal-evidence",
    "VERB": "verbal-evidence",
    "ADJ": "adjectival-evidence",
    "AUX": "auxiliary-evidence",
}

EXCLUSION_PRECEDENCE = (
    "active-catalog",
    "reading-review-required",
    "ud-syntax-review-required",
    "insufficient-ud-occurrences",
    "unstable-dominant-upos",
    "unsupported-template-evidence",
)

CSV_FIELDS = [
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
    encoded = json.dumps(
        value, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def canonical_text_sha256(path: Path) -> str:
    data = path.read_bytes().replace(b"\r\n", b"\n").replace(b"\r", b"\n")
    return hashlib.sha256(data).hexdigest()


def load_json(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError(f"JSON root must be an object: {path}")
    return payload


def load_candidates(path: Path, expected_count: int) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    seen_texts: set[str] = set()
    seen_ranks: set[int] = set()
    with path.open("r", encoding="utf-8-sig", newline="") as source:
        reader = csv.DictReader(source)
        required = {"text", "naer_general_rank", "written_per_million", "spoken_per_million"}
        if reader.fieldnames is None or not required.issubset(reader.fieldnames):
            raise ValueError(f"candidate CSV must contain {sorted(required)!r}")
        for row_number, row in enumerate(reader, start=2):
            text = (row.get("text") or "").strip()
            rank_text = (row.get("naer_general_rank") or "").strip()
            if not text or not rank_text.isdigit() or int(rank_text) <= 0:
                raise ValueError(f"invalid candidate row {row_number}")
            rank = int(rank_text)
            if text in seen_texts:
                raise ValueError(f"duplicate candidate text: {text}")
            if rank in seen_ranks:
                raise ValueError(f"duplicate candidate rank: {rank}")
            seen_texts.add(text)
            seen_ranks.add(rank)
            rows.append({
                "text": text,
                "generalRank": rank,
                "writtenPerMillion": float(row.get("written_per_million") or 0),
                "spokenPerMillion": float(row.get("spoken_per_million") or 0),
            })
    rows.sort(key=lambda row: row["generalRank"])
    if len(rows) != expected_count:
        raise ValueError(f"candidate count mismatch: expected {expected_count}, got {len(rows)}")
    if [row["generalRank"] for row in rows] != list(range(1, expected_count + 1)):
        raise ValueError("candidate ranks must form a continuous 1..N prefix")
    return rows


def load_active_catalog(path: Path, expected_count: int) -> set[str]:
    with path.open("r", encoding="utf-8-sig", newline="") as source:
        reader = csv.DictReader(source)
        if reader.fieldnames is None or "text" not in reader.fieldnames:
            raise ValueError("active catalog CSV must contain text")
        texts = [(row.get("text") or "").strip() for row in reader]
    if any(not text for text in texts):
        raise ValueError("active catalog contains an empty text")
    if len(texts) != len(set(texts)):
        raise ValueError("active catalog contains duplicate text")
    if len(texts) != expected_count:
        raise ValueError(f"active catalog count mismatch: expected {expected_count}, got {len(texts)}")
    return set(texts)


def projection_rows(payload: dict[str, Any], expected_adapter: str) -> dict[str, dict[str, Any]]:
    if payload.get("adapterVersion") != expected_adapter:
        raise ValueError(f"unexpected adapter version: {payload.get('adapterVersion')!r}")
    rows: dict[str, dict[str, Any]] = {}
    for row in payload.get("rows", []):
        if not isinstance(row, dict):
            raise ValueError("projection row must be an object")
        text = row.get("lookupText")
        if not isinstance(text, str) or not text:
            raise ValueError("projection row is missing lookupText")
        if text in rows:
            raise ValueError(f"duplicate projection identity: {text}")
        rows[text] = row
    return rows


def build_reading_lookup(
    candidate_set: set[str],
    reading_coverage: dict[str, Any],
    concised: dict[str, Any],
    revised: dict[str, Any],
    cedict: dict[str, Any],
    *,
    expected_digest: str,
    expected_review_count: int,
) -> tuple[dict[str, dict[str, str]], set[str]]:
    if reading_coverage.get("adapterVersion") != "naer-reading-coverage-summary-v1":
        raise ValueError("unexpected reading coverage adapter version")
    if reading_coverage.get("determinismDigest") != expected_digest:
        raise ValueError("reading coverage digest mismatch")
    review_queue = reading_coverage.get("reviewQueue")
    if not isinstance(review_queue, list):
        raise ValueError("reading coverage reviewQueue must be a list")
    unresolved = {row.get("text") for row in review_queue if isinstance(row, dict)}
    if None in unresolved or len(unresolved) != expected_review_count:
        raise ValueError("reading review set mismatch")
    if not unresolved.issubset(candidate_set):
        raise ValueError("reading review set contains non-candidates")

    lookup: dict[str, dict[str, str]] = {}
    for text, row in projection_rows(concised, "moe-concised-reading-adapter-v1").items():
        reading = row.get("trainerReading")
        if not isinstance(reading, str) or not reading:
            raise ValueError(f"MOE Concised row lacks trainerReading: {text}")
        lookup[text] = {
            "authority": "moe-concised",
            "evidenceType": "trainer-bopomofo",
            "evidence": reading,
        }
    for text, row in projection_rows(revised, "moe-revised-reading-fallback-adapter-v1").items():
        if text in lookup:
            raise ValueError(f"reading authority overlap: {text}")
        reading = row.get("trainerReading")
        if not isinstance(reading, str) or not reading:
            raise ValueError(f"MOE Revised row lacks trainerReading: {text}")
        lookup[text] = {
            "authority": "moe-revised",
            "evidenceType": "trainer-bopomofo",
            "evidence": reading,
        }
    for text, row in projection_rows(cedict, "cedict-identity-hints-adapter-v1").items():
        if row.get("status") != "unique-record":
            continue
        if text in lookup:
            raise ValueError(f"reading authority overlap: {text}")
        records = row.get("records")
        if not isinstance(records, list) or len(records) != 1:
            raise ValueError(f"unique CEDICT row must contain one record: {text}")
        pinyin = records[0].get("pinyin") if isinstance(records[0], dict) else None
        if not isinstance(pinyin, str) or not pinyin:
            raise ValueError(f"CEDICT row lacks numbered pinyin: {text}")
        lookup[text] = {
            "authority": "cedict-unique",
            "evidenceType": "numbered-pinyin",
            "evidence": pinyin,
        }

    resolved = candidate_set - unresolved
    if set(lookup) != resolved:
        missing = sorted(resolved - set(lookup))[:5]
        extra = sorted(set(lookup) - resolved)[:5]
        raise ValueError(f"reading lookup does not equal resolved set; missing={missing}, extra={extra}")
    return lookup, unresolved


def load_ud(
    candidate_set: set[str],
    evidence: dict[str, Any],
    coverage: dict[str, Any],
    *,
    expected_evidence_digest: str,
    expected_coverage_digest: str,
    expected_review_count: int,
) -> tuple[dict[str, dict[str, Any]], set[str], int, float]:
    if evidence.get("adapterVersion") != "ud-chinese-gsd-grammar-evidence-adapter-v1":
        raise ValueError("unexpected UD evidence adapter version")
    if evidence.get("determinismDigest") != expected_evidence_digest:
        raise ValueError("UD evidence digest mismatch")
    if coverage.get("adapterVersion") != "ud-chinese-gsd-grammar-evidence-adapter-v1":
        raise ValueError("unexpected UD coverage adapter version")
    if coverage.get("determinismDigest") != expected_coverage_digest:
        raise ValueError("UD coverage digest mismatch")
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
    if None in review_set or len(review_set) != expected_review_count:
        raise ValueError("UD review set mismatch")
    if not review_set.issubset(candidate_set):
        raise ValueError("UD review set contains non-candidates")

    mixed_policy = coverage.get("reviewPolicy", {}).get("mixedUpos", {})
    min_count = mixed_policy.get("minimumCountPerCategory")
    min_share = mixed_policy.get("minimumOccurrenceSharePerCategory")
    if not isinstance(min_count, int) or min_count <= 0:
        raise ValueError("invalid UD significant-UPOS count threshold")
    if not isinstance(min_share, (int, float)) or not 0 < float(min_share) <= 1:
        raise ValueError("invalid UD significant-UPOS share threshold")
    return rows, review_set, min_count, float(min_share)

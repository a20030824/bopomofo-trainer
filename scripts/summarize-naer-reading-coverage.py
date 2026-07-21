#!/usr/bin/env python3
"""Summarize deterministic reading-source coverage for a ranked candidate CSV.

This consumes only committed candidate-scoped projections. It verifies authority
boundaries and emits a rank-ordered review queue without choosing among ambiguous
readings or inferring grammar from dictionary glosses.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
from pathlib import Path
from typing import Any

ADAPTER_VERSION = "naer-reading-coverage-summary-v1"
DEFAULT_CANDIDATES = Path("data/lexicon/naer-1141208-top-1000-candidates.csv")
DEFAULT_CONCISED = Path("data/readings/moe-concised-2014_20260626-naer-top-1000.json")
DEFAULT_REVISED = Path("data/readings/moe-revised-2015_20260625-naer-top-1000-fallback.json")
DEFAULT_CEDICT = Path("data/identity/cedict-2026-07-21-naer-top-1000-hints.json")
DEFAULT_OUTPUT = Path("data/lexicon/naer-1141208-top-1000-reading-coverage.json")


def canonical_text_bytes(path: Path) -> bytes:
    normalized = path.read_bytes().replace(b"\r\n", b"\n").replace(b"\r", b"\n")
    return normalized.replace(b"\n", b"\r\n")


def sha256_file(path: Path) -> str:
    return hashlib.sha256(canonical_text_bytes(path)).hexdigest()


def display_path(path: Path) -> str:
    resolved = path.resolve()
    try:
        return resolved.relative_to(Path.cwd().resolve()).as_posix()
    except ValueError:
        return path.as_posix()


def canonical_digest(value: Any) -> str:
    encoded = json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def load_candidates(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    seen_texts: set[str] = set()
    seen_ranks: set[int] = set()
    with path.open("r", encoding="utf-8-sig", newline="") as source:
        reader = csv.DictReader(source)
        required = {"text", "status", "naer_general_rank"}
        if reader.fieldnames is None or not required.issubset(reader.fieldnames):
            raise ValueError(f"candidate CSV must contain {sorted(required)!r}")
        for row_number, source_row in enumerate(reader, start=2):
            text = (source_row.get("text") or "").strip()
            if not text:
                raise ValueError(f"candidate row {row_number} is missing text")
            if text in seen_texts:
                raise ValueError(f"duplicate candidate text: {text}")
            rank_source = source_row.get("naer_general_rank") or ""
            if not rank_source.isdigit() or int(rank_source) <= 0:
                raise ValueError(f"candidate row {row_number} has invalid rank")
            rank = int(rank_source)
            if rank in seen_ranks:
                raise ValueError(f"duplicate candidate rank: {rank}")
            seen_texts.add(text)
            seen_ranks.add(rank)
            rows.append({"text": text, "generalRank": rank})
    rows.sort(key=lambda row: row["generalRank"])
    expected = list(range(1, len(rows) + 1))
    observed = [row["generalRank"] for row in rows]
    if observed != expected:
        raise ValueError("candidate ranks must form a continuous 1..N prefix")
    return rows


def load_json(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError(f"JSON root must be an object: {path}")
    return payload


def unique_lookup_rows(payload: dict[str, Any], expected_adapter: str) -> dict[str, dict[str, Any]]:
    if payload.get("adapterVersion") != expected_adapter:
        raise ValueError(f"unexpected adapter version: {payload.get('adapterVersion')!r}")
    rows: dict[str, dict[str, Any]] = {}
    for row in payload.get("rows", []):
        text = row.get("lookupText")
        if not isinstance(text, str) or not text:
            raise ValueError("projection row is missing lookupText")
        if text in rows:
            raise ValueError(f"duplicate projection identity: {text}")
        rows[text] = row
    return rows


def compact_cedict_record(record: dict[str, Any]) -> dict[str, Any]:
    return {
        "sourceLine": record.get("sourceLine"),
        "traditional": record.get("traditional"),
        "simplified": record.get("simplified"),
        "pinyin": record.get("pinyin"),
        "matchKinds": record.get("matchKinds", []),
        "canonicalTraditionalHint": record.get("canonicalTraditionalHint"),
        "variantTargets": record.get("variantTargets", []),
        "properNameHint": bool(record.get("properNameHint", False)),
    }


def summarize_coverage(
    candidate_path: Path,
    concised_path: Path,
    revised_path: Path,
    cedict_path: Path,
) -> dict[str, Any]:
    candidates = load_candidates(candidate_path)
    candidate_rank = {row["text"]: row["generalRank"] for row in candidates}
    candidate_set = set(candidate_rank)

    concised = load_json(concised_path)
    revised = load_json(revised_path)
    cedict = load_json(cedict_path)
    concised_rows = unique_lookup_rows(concised, "moe-concised-reading-adapter-v1")
    revised_rows = unique_lookup_rows(revised, "moe-revised-reading-fallback-adapter-v1")
    cedict_rows = unique_lookup_rows(cedict, "cedict-identity-hints-adapter-v1")

    concised_set = set(concised_rows)
    revised_set = set(revised_rows)
    if concised_set & revised_set:
        raise ValueError("MOE Concised and Revised accepted identities overlap")
    moe_set = concised_set | revised_set
    if not moe_set.issubset(candidate_set):
        raise ValueError("MOE projection contains identities outside candidate set")

    expected_cedict_targets = candidate_set - moe_set
    observed_cedict_targets = set(
        cedict.get("resolutionBasis", {}).get("cedictTargetTexts", [])
    )
    if observed_cedict_targets != expected_cedict_targets:
        raise ValueError("CEDICT target set does not equal candidates unresolved after MOE")
    if cedict.get("resolutionBasis", {}).get("candidateEntryCount") != len(candidates):
        raise ValueError("CEDICT candidate count mismatch")

    cedict_unique: set[str] = set()
    cedict_ambiguous: set[str] = set()
    for text, row in cedict_rows.items():
        if text not in expected_cedict_targets:
            raise ValueError(f"CEDICT row is outside unresolved target set: {text}")
        status = row.get("status")
        records = row.get("records")
        if not isinstance(records, list) or not records:
            raise ValueError(f"CEDICT row has no records: {text}")
        if status == "unique-record":
            if len(records) != 1:
                raise ValueError(f"unique CEDICT row must contain one record: {text}")
            cedict_unique.add(text)
        elif status == "ambiguous-records":
            if len(records) < 2:
                raise ValueError(f"ambiguous CEDICT row must contain multiple records: {text}")
            cedict_ambiguous.add(text)
        else:
            raise ValueError(f"unsupported CEDICT status for {text}: {status!r}")

    unmatched = set(cedict.get("diagnostics", {}).get("unmatchedTexts", []))
    if cedict_unique & cedict_ambiguous or (cedict_unique | cedict_ambiguous) & unmatched:
        raise ValueError("CEDICT unique, ambiguous, and unmatched sets overlap")
    if cedict_unique | cedict_ambiguous | unmatched != expected_cedict_targets:
        raise ValueError("CEDICT diagnostics do not completely partition unresolved targets")

    resolved = moe_set | cedict_unique
    review = cedict_ambiguous | unmatched
    if resolved & review or resolved | review != candidate_set:
        raise ValueError("reading coverage does not partition the candidate set")

    review_queue: list[dict[str, Any]] = []
    for text in sorted(review, key=lambda value: candidate_rank[value]):
        if text in unmatched:
            review_queue.append(
                {
                    "generalRank": candidate_rank[text],
                    "text": text,
                    "status": "unmatched",
                    "records": [],
                }
            )
        else:
            review_queue.append(
                {
                    "generalRank": candidate_rank[text],
                    "text": text,
                    "status": "ambiguous-cedict",
                    "records": [
                        compact_cedict_record(record)
                        for record in cedict_rows[text]["records"]
                    ],
                }
            )

    cedict_unique_rows = [
        {
            "generalRank": candidate_rank[text],
            "text": text,
            "pinyin": cedict_rows[text]["records"][0]["pinyin"],
            "sourceLine": cedict_rows[text]["records"][0]["sourceLine"],
        }
        for text in sorted(cedict_unique, key=lambda value: candidate_rank[value])
    ]

    buckets = [(1, 100), (101, 250), (251, 500), (501, len(candidates))]
    rank_buckets: list[dict[str, Any]] = []
    sources = {
        "moeConcised": concised_set,
        "moeRevised": revised_set,
        "cedictUnique": cedict_unique,
        "reviewAmbiguous": cedict_ambiguous,
        "reviewUnmatched": unmatched,
    }
    for start, end in buckets:
        if start > len(candidates):
            continue
        end = min(end, len(candidates))
        rank_buckets.append(
            {
                "startRank": start,
                "endRank": end,
                "counts": {
                    name: sum(
                        start <= candidate_rank[text] <= end
                        for text in values
                    )
                    for name, values in sources.items()
                },
            }
        )

    core = {
        "candidateCount": len(candidates),
        "coverage": {
            "moeConcisedUnique": len(concised_set),
            "moeRevisedUniqueFallback": len(revised_set),
            "cedictUniqueFallback": len(cedict_unique),
            "automaticallyResolved": len(resolved),
            "reviewRequired": len(review),
            "cedictAmbiguous": len(cedict_ambiguous),
            "unmatched": len(unmatched),
        },
        "rankBuckets": rank_buckets,
        "cedictUniqueRows": cedict_unique_rows,
        "reviewQueue": review_queue,
    }
    return {
        "adapterVersion": ADAPTER_VERSION,
        "authorityOrder": [
            "moe-concised-unique-exact-headword",
            "moe-revised-unique-exact-headword-fallback",
            "cedict-unique-record-fallback",
            "explicit-reviewed-manual-resolution",
        ],
        "inputs": {
            "candidates": {
                "path": display_path(candidate_path),
                "checksumSha256": sha256_file(candidate_path),
            },
            "moeConcised": {
                "path": display_path(concised_path),
                "checksumSha256": sha256_file(concised_path),
            },
            "moeRevised": {
                "path": display_path(revised_path),
                "checksumSha256": sha256_file(revised_path),
            },
            "cedict": {
                "path": display_path(cedict_path),
                "checksumSha256": sha256_file(cedict_path),
            },
        },
        **core,
        "determinismDigest": canonical_digest(core),
        "policy": {
            "ambiguousReadingSelection": "forbidden",
            "grammarInferenceFromGlosses": "forbidden",
            "productCatalogMutation": "out-of-scope",
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--candidates", type=Path, default=DEFAULT_CANDIDATES)
    parser.add_argument("--concised-projection", type=Path, default=DEFAULT_CONCISED)
    parser.add_argument("--revised-projection", type=Path, default=DEFAULT_REVISED)
    parser.add_argument("--cedict-projection", type=Path, default=DEFAULT_CEDICT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    arguments = parser.parse_args()

    payload = summarize_coverage(
        arguments.candidates,
        arguments.concised_projection,
        arguments.revised_projection,
        arguments.cedict_projection,
    )
    arguments.output.parent.mkdir(parents=True, exist_ok=True)
    arguments.output.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    coverage = payload["coverage"]
    print(
        f"resolved {coverage['automaticallyResolved']} of {payload['candidateCount']}; "
        f"{coverage['reviewRequired']} require review; "
        f"digest {payload['determinismDigest']}"
    )


if __name__ == "__main__":
    main()

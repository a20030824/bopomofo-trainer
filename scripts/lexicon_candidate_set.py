#!/usr/bin/env python3
"""Shared manifest-driven loader for ranked lexical candidate generations."""

from __future__ import annotations

import csv
import hashlib
import json
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

LOADER_VERSION = "lexicon-candidate-set-loader-v1"
SUPPORTED_MANIFEST_ADAPTERS = {
    "naer-lexicon-candidates-adapter-v1",
    "naer-lexicon-candidates-adapter-v2",
}
DEFAULT_RANK_BUCKET_ENDS = (100, 250, 500, 1_000, 2_500, 5_000, 10_000)


def canonical_digest(value: Any) -> str:
    encoded = json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def canonical_text_sha256(path: Path) -> str:
    data = path.read_bytes().replace(b"\r\n", b"\n").replace(b"\r", b"\n")
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def display_path(path: Path) -> str:
    resolved = path.resolve()
    try:
        return resolved.relative_to(Path.cwd().resolve()).as_posix()
    except ValueError:
        return path.as_posix()


def optional_number(value: str | None, *, label: str) -> float | None:
    raw = "" if value is None else value.strip()
    if raw == "":
        return None
    try:
        number = float(raw)
    except ValueError as error:
        raise ValueError(f"{label} must be numeric or blank") from error
    if not math.isfinite(number):
        raise ValueError(f"{label} must be finite")
    return number


@dataclass(frozen=True)
class RankedCandidate:
    text: str
    general_rank: int
    written_per_million: float | None
    spoken_per_million: float | None
    csv_row_number: int

    def digest_row(self) -> dict[str, Any]:
        return {
            "generalRank": self.general_rank,
            "lexicalText": self.text,
            "spokenPerMillion": self.spoken_per_million,
            "writtenPerMillion": self.written_per_million,
        }

    def manifest_row(self) -> dict[str, Any]:
        return {
            "generalRank": self.general_rank,
            "lexicalText": self.text,
            "writtenPerMillion": self.written_per_million,
            "spokenPerMillion": self.spoken_per_million,
        }


@dataclass(frozen=True)
class CandidateSet:
    records: tuple[RankedCandidate, ...]
    candidate_path: Path
    manifest_path: Path | None
    manifest: dict[str, Any] | None
    source_rank_limit: int
    selection_digest: str
    candidate_checksum_sha256: str
    manifest_checksum_sha256: str | None

    @property
    def texts(self) -> tuple[str, ...]:
        return tuple(record.text for record in self.records)

    @property
    def ranks(self) -> tuple[int, ...]:
        return tuple(record.general_rank for record in self.records)

    @property
    def by_text(self) -> dict[str, RankedCandidate]:
        return {record.text: record for record in self.records}

    def lineage(self) -> dict[str, Any]:
        result: dict[str, Any] = {
            "loaderVersion": LOADER_VERSION,
            "candidatePath": display_path(self.candidate_path),
            "candidateChecksumSha256": self.candidate_checksum_sha256,
            "candidateCount": len(self.records),
            "sourceRankLimit": self.source_rank_limit,
            "selectionDigest": self.selection_digest,
        }
        if self.manifest_path is not None and self.manifest is not None:
            result.update({
                "manifestPath": display_path(self.manifest_path),
                "manifestChecksumSha256": self.manifest_checksum_sha256,
                "manifestAdapterVersion": self.manifest.get("adapterVersion"),
            })
        return result


def load_json_object(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError(f"JSON root must be an object: {path}")
    return payload


def load_ranked_candidates(
    candidate_path: Path,
    *,
    require_dense_prefix: bool = False,
) -> tuple[RankedCandidate, ...]:
    records: list[RankedCandidate] = []
    seen_texts: set[str] = set()
    seen_ranks: set[int] = set()
    with candidate_path.open("r", encoding="utf-8-sig", newline="") as source:
        reader = csv.DictReader(source)
        required = {"text", "naer_general_rank"}
        if reader.fieldnames is None or not required.issubset(reader.fieldnames):
            raise ValueError(f"candidate CSV must contain {sorted(required)!r}")
        for row_number, row in enumerate(reader, start=2):
            if (row.get("status") or "").strip() == "excluded":
                continue
            text = (row.get("text") or "").strip()
            if not text:
                raise ValueError(f"candidate row {row_number} is missing text")
            if text in seen_texts:
                raise ValueError(f"duplicate candidate text: {text}")
            rank_source = (row.get("naer_general_rank") or "").strip()
            if not rank_source.isdigit() or int(rank_source) <= 0:
                raise ValueError(f"candidate row {row_number} has invalid rank")
            rank = int(rank_source)
            if rank in seen_ranks:
                raise ValueError(f"duplicate candidate rank: {rank}")
            seen_texts.add(text)
            seen_ranks.add(rank)
            records.append(RankedCandidate(
                text=text,
                general_rank=rank,
                written_per_million=optional_number(
                    row.get("written_per_million"),
                    label=f"candidate row {row_number} written_per_million",
                ),
                spoken_per_million=optional_number(
                    row.get("spoken_per_million"),
                    label=f"candidate row {row_number} spoken_per_million",
                ),
                csv_row_number=row_number,
            ))
    records.sort(key=lambda item: item.general_rank)
    if not records:
        raise ValueError("candidate CSV must contain at least one eligible row")
    if require_dense_prefix:
        observed = [record.general_rank for record in records]
        expected = list(range(1, len(records) + 1))
        if observed != expected:
            raise ValueError("candidate ranks must form a continuous 1..N prefix")
    return tuple(records)


def validate_manifest(
    records: tuple[RankedCandidate, ...],
    manifest_path: Path,
) -> tuple[dict[str, Any], int, str]:
    manifest = load_json_object(manifest_path)
    adapter_version = manifest.get("adapterVersion")
    if adapter_version not in SUPPORTED_MANIFEST_ADAPTERS:
        raise ValueError(f"unsupported candidate manifest adapter version: {adapter_version!r}")
    selection = manifest.get("selection")
    if not isinstance(selection, dict):
        raise ValueError("candidate manifest selection must be an object")
    selected_count = selection.get("selectedCount")
    if selected_count != len(records):
        raise ValueError(
            f"candidate manifest selected count mismatch: expected {len(records)}, found {selected_count}"
        )
    normalized_count = selection.get("normalizedTextCount")
    if normalized_count != len({record.text for record in records}):
        raise ValueError("candidate manifest normalized text count mismatch")
    source_rank_limit = selection.get("limit")
    if not isinstance(source_rank_limit, int) or source_rank_limit <= 0:
        raise ValueError("candidate manifest limit must be a positive integer")
    if max(record.general_rank for record in records) > source_rank_limit:
        raise ValueError("candidate manifest limit is below an accepted source rank")

    digest_rows = [record.digest_row() for record in records]
    selection_digest = canonical_digest(digest_rows)
    if selection.get("determinismDigest") != selection_digest:
        raise ValueError("candidate manifest selection digest mismatch")

    manifest_rows = manifest.get("rows")
    if not isinstance(manifest_rows, list):
        raise ValueError("candidate manifest rows must be an array")
    expected_rows = [record.manifest_row() for record in records]
    normalized_manifest_rows = [
        {
            "generalRank": row.get("generalRank") if isinstance(row, dict) else None,
            "lexicalText": row.get("lexicalText") if isinstance(row, dict) else None,
            "writtenPerMillion": row.get("writtenPerMillion") if isinstance(row, dict) else None,
            "spokenPerMillion": row.get("spokenPerMillion") if isinstance(row, dict) else None,
        }
        for row in manifest_rows
    ]
    if normalized_manifest_rows != expected_rows:
        raise ValueError("candidate manifest rows do not exactly match the candidate CSV")
    return manifest, source_rank_limit, selection_digest


def load_candidate_set(
    candidate_path: Path,
    manifest_path: Path | None = None,
    *,
    require_manifest: bool = False,
    require_dense_prefix: bool = False,
) -> CandidateSet:
    records = load_ranked_candidates(
        candidate_path,
        require_dense_prefix=require_dense_prefix,
    )
    manifest: dict[str, Any] | None = None
    manifest_checksum: str | None = None
    selection_digest = canonical_digest([record.digest_row() for record in records])
    source_rank_limit = max(record.general_rank for record in records)
    if manifest_path is not None:
        manifest, source_rank_limit, selection_digest = validate_manifest(records, manifest_path)
        manifest_checksum = sha256_file(manifest_path)
    elif require_manifest:
        raise ValueError("a candidate manifest is required")
    return CandidateSet(
        records=records,
        candidate_path=candidate_path,
        manifest_path=manifest_path,
        manifest=manifest,
        source_rank_limit=source_rank_limit,
        selection_digest=selection_digest,
        candidate_checksum_sha256=canonical_text_sha256(candidate_path),
        manifest_checksum_sha256=manifest_checksum,
    )


def rank_intervals(
    source_rank_limit: int,
    *,
    preferred_ends: Iterable[int] = DEFAULT_RANK_BUCKET_ENDS,
) -> list[tuple[int, int]]:
    if not isinstance(source_rank_limit, int) or source_rank_limit <= 0:
        raise ValueError("source rank limit must be a positive integer")
    ends = sorted({end for end in preferred_ends if 0 < end < source_rank_limit})
    ends.append(source_rank_limit)
    intervals: list[tuple[int, int]] = []
    start = 1
    for end in ends:
        intervals.append((start, end))
        start = end + 1
    return intervals

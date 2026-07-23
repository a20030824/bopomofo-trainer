from __future__ import annotations

import sys
from pathlib import Path
from typing import Any, Mapping

SCRIPTS_DIR = Path(__file__).resolve().parents[1]
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from lexicon_candidate_set import CandidateSet, load_candidate_set, rank_intervals

from . import projector
from .common import Candidate, Observation, canonical_digest


def rank_bucket_summary(
    generation: CandidateSet,
    observations: dict[str, Observation],
) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    records = generation.records
    for start, end in rank_intervals(generation.source_rank_limit):
        selected = [record for record in records if start <= record.general_rank <= end]
        observed = sum(observations[record.text].occurrence_count > 0 for record in selected)
        result.append({
            "startRank": start,
            "endRank": end,
            "candidateCount": len(selected),
            "observedCandidateCount": observed,
            "unseenCandidateCount": len(selected) - observed,
            "matchedOccurrenceCount": sum(
                observations[record.text].occurrence_count for record in selected
            ),
        })
    return result


def coverage_core(coverage: dict[str, Any]) -> dict[str, Any]:
    outer = {
        "adapterVersion",
        "schemaVersion",
        "sourceId",
        "release",
        "evidenceDigest",
        "determinismDigest",
    }
    return {key: value for key, value in coverage.items() if key not in outer}


def project_generation(
    candidate_path: Path,
    candidate_manifest_path: Path,
    source_dir: Path,
    *,
    expected_files: Mapping[str, Mapping[str, Any]] = projector.EXPECTED_FILES,
) -> tuple[dict[str, Any], dict[str, Any]]:
    generation = load_candidate_set(
        candidate_path,
        candidate_manifest_path,
        require_manifest=True,
    )
    projected_candidates = [
        Candidate(text=record.text, general_rank=record.general_rank)
        for record in generation.records
    ]

    original_load_candidates = projector.load_candidates
    original_rank_bucket_summary = projector.rank_bucket_summary

    def load_generation_candidates(
        path: Path,
        expected_count: int,
        expected_checksum: str,
    ) -> list[Candidate]:
        if path.resolve() != candidate_path.resolve():
            raise ValueError("UD generation candidate path changed during projection")
        if expected_count != len(projected_candidates):
            raise ValueError("UD generation candidate count changed during projection")
        if expected_checksum != generation.candidate_checksum_sha256:
            raise ValueError("UD generation candidate checksum changed during projection")
        return projected_candidates

    def summarize_generation_buckets(
        candidates: list[Candidate],
        observations: dict[str, Observation],
    ) -> list[dict[str, Any]]:
        if candidates != projected_candidates:
            raise ValueError("UD generation candidate order changed during projection")
        return rank_bucket_summary(generation, observations)

    projector.load_candidates = load_generation_candidates
    projector.rank_bucket_summary = summarize_generation_buckets
    try:
        evidence, coverage = projector.project(
            candidate_path,
            source_dir,
            expected_candidate_count=len(projected_candidates),
            expected_candidate_checksum=generation.candidate_checksum_sha256,
            expected_files=expected_files,
        )
    finally:
        projector.load_candidates = original_load_candidates
        projector.rank_bucket_summary = original_rank_bucket_summary

    evidence["source"]["redistributionBoundary"] = (
        "complete CoNLL-U files and source sentences remain local; committed outputs "
        "contain only aggregate anonymous syntax evidence for manifest-linked candidate identities"
    )
    evidence["candidateSource"] = {
        "path": candidate_path.as_posix(),
        "canonicalChecksumSha256": generation.candidate_checksum_sha256,
        "manifestLineage": generation.lineage(),
    }
    coverage["rankBuckets"] = rank_bucket_summary(
        generation,
        {
            row["text"]: _observation_from_evidence_row(row)
            for row in evidence["rows"]
        },
    )
    core = coverage_core(coverage)
    coverage["determinismDigest"] = canonical_digest(core)
    return evidence, coverage


def _observation_from_evidence_row(row: dict[str, Any]) -> Observation:
    observation = Observation()
    observation.occurrence_count = int(row.get("occurrenceCount", 0))
    return observation

#!/usr/bin/env python3
"""Small shared policy surface for forward catalog generations.

This module intentionally contains no historical batch paths, fixed candidate
counts, or replay digests.  Forward generation/apply tools may import it
without pulling the retired top-1,000 review pipeline back into the runtime.
"""

from __future__ import annotations

import csv
import hashlib
import json
import os
import subprocess
from io import StringIO
from pathlib import Path
from typing import Any, Mapping, Sequence

ROOT = Path(__file__).resolve().parents[1]

DEFAULT_WORDS = ROOT / "data/source/words.sample.csv"
DEFAULT_GRAMMAR = ROOT / "data/source/grammar.sample.csv"
DEFAULT_PROVENANCE = ROOT / "data/provenance.csv"
DEFAULT_ACTIVE_CONCISED = (
    ROOT / "data/readings/moe-concised-2014_20260626-active-catalog.json"
)
DEFAULT_ACTIVE_REVISED = (
    ROOT / "data/readings/moe-revised-2015_20260625-active-catalog-fallback.json"
)

DEFAULT_MIN_OCCURRENCES = 5
REVIEW_LANES: Mapping[str, str] = {
    "NOUN": "nominal-evidence",
    "PROPN": "nominal-evidence",
    "PRON": "nominal-evidence",
    "VERB": "verbal-evidence",
    "ADJ": "adjectival-evidence",
    "AUX": "auxiliary-evidence",
}

WORDS_FIELDS = [
    "text",
    "reading",
    "frequency_band",
    "tags",
    "status",
    "provenance_ids",
]
GRAMMAR_FIELDS = [
    "text",
    "reading",
    "roles",
    "predicate_frame",
    "standalone_kind",
    "provenance_ids",
]
PROVENANCE_FIELDS = ["id", "kind", "title", "license", "notes"]


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def load_json(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError(f"JSON root must be an object: {path}")
    return payload


def json_text(payload: Mapping[str, Any]) -> str:
    return json.dumps(payload, ensure_ascii=False, indent=2) + "\n"


def load_csv(path: Path, expected_fields: Sequence[str]) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as source:
        reader = csv.DictReader(source)
        if reader.fieldnames != list(expected_fields):
            raise ValueError(
                f"unexpected CSV fields in {path}: {reader.fieldnames!r}; "
                f"expected {list(expected_fields)!r}"
            )
        return [dict(row) for row in reader]


def csv_text(rows: Sequence[Mapping[str, str]], fields: Sequence[str]) -> str:
    destination = StringIO(newline="")
    writer = csv.DictWriter(
        destination,
        fieldnames=list(fields),
        lineterminator="\n",
        extrasaction="raise",
    )
    writer.writeheader()
    writer.writerows(rows)
    return destination.getvalue()


def atomic_write_lf(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    with temporary.open("w", encoding="utf-8", newline="\n") as destination:
        destination.write(text)
        destination.flush()
        os.fsync(destination.fileno())
    temporary.replace(path)


def projection_rows(payload: Mapping[str, Any], label: str) -> list[dict[str, Any]]:
    rows = payload.get("rows")
    if not isinstance(rows, list) or any(not isinstance(row, dict) for row in rows):
        raise ValueError(f"{label} rows are malformed")
    values = [dict(row) for row in rows]
    identities = [str(row.get("lookupText", "")) for row in values]
    if len(set(identities)) != len(identities) or any(not value for value in identities):
        raise ValueError(f"{label} has missing or duplicate lookupText values")
    return values


def convert_numbered_pinyin(values: Sequence[str]) -> list[str]:
    """Convert numbered pinyin through the repository's single TS table."""
    if not values:
        return []
    result = subprocess.run(
        ["npx", "tsx", str(ROOT / "scripts/convert-numbered-pinyin.ts")],
        input=json.dumps(list(values)),
        capture_output=True,
        text=True,
        encoding="utf-8",
        cwd=ROOT,
        shell=(os.name == "nt"),
    )
    if result.returncode != 0:
        raise ValueError(f"numbered pinyin conversion failed: {result.stderr}")
    payload = json.loads(result.stdout)
    readings: list[str] = []
    for value, item in zip(values, payload, strict=True):
        if not isinstance(item, dict) or not item.get("ok"):
            reason = item.get("reason") if isinstance(item, dict) else "malformed result"
            raise ValueError(f"numbered pinyin conversion failed for {value!r}: {reason}")
        reading = item.get("reading")
        if not isinstance(reading, str) or not reading:
            raise ValueError(f"numbered pinyin conversion returned no reading for {value!r}")
        readings.append(reading)
    return readings


def significant_upos(row: dict[str, Any], minimum_count: int, minimum_share: float) -> list[str]:
    occurrence_count = row.get("occurrenceCount")
    counts = row.get("uposCounts")
    if not isinstance(occurrence_count, int) or occurrence_count <= 0 or not isinstance(counts, dict):
        return []
    return sorted(
        tag
        for tag, count in counts.items()
        if isinstance(tag, str)
        and isinstance(count, int)
        and count >= minimum_count
        and count / occurrence_count >= minimum_share
    )


def _parse_counts(value: str) -> dict[str, int]:
    if not value:
        return {}
    return {key: int(count) for key, count in (part.split("=") for part in value.split(";"))}


def classify(row: dict[str, str]) -> tuple[str, str, str, str, str]:
    """Map stable UD evidence to the existing catalog grammar schema."""
    automatic = "Automatically approved by statistical heuristic; not manually reviewed"
    held_reason = "held-auto-unclassified"

    def held() -> tuple[str, str, str, str, str]:
        return ("held-context-dependent", "", "", "", held_reason)

    lane = row["review_lane"]
    upos = row["dominant_upos"]
    occurrence = int(row["occurrence_count"])
    dependencies = _parse_counts(row["dependency_relation_counts"])

    if lane == "nominal-evidence":
        if upos not in ("NOUN", "PROPN", "PRON"):
            return held()
        temporal_share = dependencies.get("nmod:tmod", 0) / occurrence if occurrence else 0.0
        if temporal_share >= 0.3:
            return ("approved-existing-schema", "temporal", "none", "lexical-prompt", automatic)
        return ("approved-existing-schema", "subject;object", "none", "lexical-prompt", automatic)

    if lane == "verbal-evidence":
        if upos != "VERB":
            return held()
        frame = row["verb_object_frame"]
        if frame == "object-bearing-only":
            return (
                "approved-existing-schema",
                "transitive-predicate",
                "transitive",
                "lexical-prompt",
                automatic,
            )
        if frame == "objectless-only":
            return (
                "approved-existing-schema",
                "intransitive-predicate",
                "intransitive",
                "lexical-prompt",
                automatic,
            )
        return (
            "approved-existing-schema",
            "object;intransitive-predicate;transitive-predicate;verb",
            "ambitransitive",
            "lexical-prompt",
            automatic,
        )

    if lane == "adjectival-evidence" and upos == "ADJ":
        return (
            "approved-existing-schema",
            "adjectival-predicate",
            "adjectival",
            "lexical-prompt",
            automatic,
        )
    if lane == "auxiliary-evidence" and upos == "AUX":
        return ("approved-existing-schema", "modal", "modal", "lexical-prompt", automatic)
    return held()


def refresh_concised_scope(payload: dict[str, Any], *, active_catalog_count: int) -> dict[str, Any]:
    """Refresh active-catalog scope when no new row is Concised-resolved."""
    rows = projection_rows(payload, "active Concised projection")
    candidate_set = payload.get("candidateSet")
    diagnostics = payload.get("diagnostics")
    if not isinstance(candidate_set, dict) or not isinstance(diagnostics, dict):
        raise ValueError("active Concised metadata is malformed")
    source_count = diagnostics.get("sourceRowCount")
    scoped_count = diagnostics.get("candidateScopedSourceRowCount")
    if not isinstance(source_count, int) or not isinstance(scoped_count, int):
        raise ValueError("active Concised diagnostics are missing counts")
    payload["candidateSet"] = {
        **candidate_set,
        "entryCount": active_catalog_count,
        "normalizedTextCount": active_catalog_count,
    }
    payload["diagnostics"] = {
        **diagnostics,
        "acceptedCandidateCount": len(rows),
        "omittedNonCandidateSourceRowCount": source_count - scoped_count,
    }
    return payload


def refresh_revised_scope(
    payload: dict[str, Any],
    *,
    active_texts: set[str],
    concised_texts: set[str],
    concised_sha256: str,
) -> dict[str, Any]:
    """Refresh Revised fallback scope when no new row is Revised-resolved."""
    rows = projection_rows(payload, "active Revised projection")
    fallback_basis = payload.get("fallbackBasis")
    diagnostics = payload.get("diagnostics")
    if not isinstance(fallback_basis, dict) or not isinstance(diagnostics, dict):
        raise ValueError("active Revised metadata is malformed")
    expected_fallback = active_texts - concised_texts
    final_texts = {str(row["lookupText"]) for row in rows}
    if not final_texts.issubset(expected_fallback):
        raise ValueError("Revised accepted rows are outside the fallback target set")
    source_count = diagnostics.get("sourceRowCount")
    previous_scoped = diagnostics.get("candidateScopedSourceRowCount")
    if not isinstance(source_count, int) or not isinstance(previous_scoped, int):
        raise ValueError("active Revised diagnostics are missing counts")
    payload["fallbackBasis"] = {
        **fallback_basis,
        "concisedProjectionChecksumSha256": concised_sha256,
        "concisedAcceptedCandidateCount": len(concised_texts),
        "fallbackCandidateCount": len(expected_fallback),
        "fallbackCandidateTexts": sorted(expected_fallback),
    }
    payload["diagnostics"] = {
        **diagnostics,
        "acceptedFallbackCount": len(rows),
        "unmatchedFallbackTexts": sorted(
            set(diagnostics.get("unmatchedFallbackTexts", [])) & expected_fallback
        ),
        "multipleReadingTexts": sorted(
            set(diagnostics.get("multipleReadingTexts", [])) & expected_fallback
        ),
        "omittedNonFallbackSourceRowCount": source_count - previous_scoped,
    }
    return payload

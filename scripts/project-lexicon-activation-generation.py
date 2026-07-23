#!/usr/bin/env python3
"""Build a manifest-driven catalog activation generation report.

This replaces fixed historical batch constants for future vocabulary expansion. It
never guesses among ambiguous readings and never treats runtime grammar admission as
a prerequisite for catalog identity activation.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import re
import subprocess
import sys
from pathlib import Path
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
ROOT = SCRIPT_DIR.parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from lexicon_candidate_set import CandidateSet, canonical_digest, load_candidate_set

ADAPTER_VERSION = "lexicon-activation-generation-v1"


def load_json(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError(f"JSON root must be an object: {path}")
    return payload


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


def convert_numbered_pinyin(values: list[str]) -> list[tuple[str, str] | tuple[None, str]]:
    """Convert CEDICT numbered pinyin through the repository's single TS table.

    Returns one `(reading, None)` or `(None, failureReason)` pair per input value.
    A single unsupported syllable (e.g. a bare erhua "r" final) must not abort
    conversion for every other candidate in the batch.
    """
    if not values:
        return []
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
    if not isinstance(payload, list) or len(payload) != len(values):
        raise ValueError("numbered pinyin conversion returned an invalid result")
    outcomes: list[tuple[str, str] | tuple[None, str]] = []
    for item in payload:
        if not isinstance(item, dict) or "ok" not in item:
            raise ValueError("numbered pinyin conversion returned an invalid item")
        if item["ok"]:
            reading = item.get("reading")
            if not isinstance(reading, str) or not reading:
                raise ValueError("numbered pinyin conversion returned an empty reading")
            outcomes.append((reading, None))
        else:
            reason = item.get("reason")
            if not isinstance(reason, str) or not reason:
                raise ValueError("numbered pinyin conversion failure is missing a reason")
            outcomes.append((None, reason))
    return outcomes


def load_active_catalog(path: Path) -> tuple[set[tuple[str, str]], set[str]]:
    identities: set[tuple[str, str]] = set()
    texts: set[str] = set()
    with path.open("r", encoding="utf-8-sig", newline="") as source:
        reader = csv.DictReader(source)
        required = {"text", "reading"}
        if reader.fieldnames is None or not required.issubset(reader.fieldnames):
            raise ValueError(f"active catalog must contain {sorted(required)!r}")
        for row_number, row in enumerate(reader, start=2):
            text = (row.get("text") or "").strip()
            reading = (row.get("reading") or "").strip()
            if not text or not reading:
                raise ValueError(f"active catalog row {row_number} has an empty identity")
            identity = (text, reading)
            if identity in identities:
                raise ValueError(f"duplicate active catalog identity: {identity!r}")
            identities.add(identity)
            texts.add(text)
    return identities, texts


def projection_rows(
    payload: dict[str, Any],
    expected_adapter: str,
) -> dict[str, dict[str, Any]]:
    if payload.get("adapterVersion") != expected_adapter:
        raise ValueError(
            f"unexpected projection adapter: expected {expected_adapter}, "
            f"found {payload.get('adapterVersion')!r}"
        )
    result: dict[str, dict[str, Any]] = {}
    for row in payload.get("rows", []):
        if not isinstance(row, dict):
            raise ValueError("projection row must be an object")
        text = row.get("lookupText")
        if not isinstance(text, str) or not text or text in result:
            raise ValueError("projection contains an invalid or duplicate lookupText")
        result[text] = row
    return result


# Characters whose citation-form reading shifts by tone sandhi depending on
# the following syllable (e.g. 一 yi1 -> yi2/yi4, 不 bu4 -> bu2) rather than
# by dictionary lookup. A word containing one cannot be resolved by naive
# per-character concatenation, so it is left for human review instead of
# risking a systematically wrong reading.
TONE_SANDHI_RISK_CHARACTERS = frozenset({"一", "不"})

# MOE Concised occasionally records a headword's second reading only as free
# text inside multiReadingReference (e.g. 台's entry is "(一) yi2" with
# "(二)ㄊㄞˊ tái" mentioned only in a note) instead of a separate structured
# row, so the adapter's own "unique reading" is not reliably the dominant
# modern reading. A component whose concised entry carries such a note is
# unsafe to reuse in a compound.
BOPOMOFO_PATTERN = re.compile(r"[ㄅ-ㄩ]")


def has_undeclared_alternate_reading(concised_rows: dict[str, dict[str, Any]], character: str) -> bool:
    row = concised_rows.get(character)
    if row is None:
        return False
    reference = row.get("multiReadingReference")
    return isinstance(reference, str) and bool(BOPOMOFO_PATTERN.search(reference))


def derive_component_readings(
    lookup: dict[str, dict[str, str]],
    unresolved: dict[str, str],
    concised_rows: dict[str, dict[str, Any]],
) -> None:
    """Resolves a multi-character candidate by concatenating already-resolved
    single-character readings from the same batch (e.g. 走到 from 走 + 到).

    Only applies when every character is itself a clean single-character
    resolution in `lookup` with no undeclared alternate reading, and the word
    contains no tone-sandhi-risk character. Mutates both maps in place,
    moving qualifying texts from `unresolved` into `lookup`.
    """
    for text in [text for text in unresolved if len(text) > 1]:
        characters = list(text)
        if TONE_SANDHI_RISK_CHARACTERS & set(characters):
            continue
        if any(has_undeclared_alternate_reading(concised_rows, character) for character in characters):
            continue
        components = [lookup.get(character) for character in characters]
        if any(component is None for component in components):
            continue
        readings = " ".join(component["evidence"] for component in components)
        lookup[text] = {
            "authority": "derived-component-concatenation",
            "evidenceType": "trainer-bopomofo",
            "evidence": readings,
            "sourceEvidenceType": "component-texts",
            "sourceEvidence": ",".join(characters),
        }
        del unresolved[text]


def build_reading_lookup(
    generation: CandidateSet,
    reading_coverage: dict[str, Any],
    concised: dict[str, Any],
    revised: dict[str, Any],
    cedict: dict[str, Any],
) -> tuple[dict[str, dict[str, str]], dict[str, str]]:
    if reading_coverage.get("adapterVersion") != "naer-reading-coverage-summary-v1":
        raise ValueError("unsupported reading coverage adapter")
    if reading_coverage.get("candidateCount") != len(generation.records):
        raise ValueError("reading coverage candidate count mismatch")
    candidate_texts = set(generation.texts)
    concised_rows = projection_rows(concised, "moe-concised-reading-adapter-v1")
    revised_rows = projection_rows(revised, "moe-revised-reading-fallback-adapter-v1")
    cedict_rows = projection_rows(cedict, "cedict-identity-hints-adapter-v1")

    lookup: dict[str, dict[str, str]] = {}
    for text, row in concised_rows.items():
        reading = row.get("trainerReading")
        if not isinstance(reading, str) or not reading:
            raise ValueError(f"MOE Concised row lacks trainerReading: {text}")
        lookup[text] = {
            "authority": "moe-concised",
            "evidenceType": "trainer-bopomofo",
            "evidence": reading,
        }
    for text, row in revised_rows.items():
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

    unresolved: dict[str, str] = {}

    cedict_sources: list[tuple[str, str]] = []
    for text, row in cedict_rows.items():
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
        cedict_sources.append((text, pinyin))
    converted = convert_numbered_pinyin([pinyin for _, pinyin in cedict_sources])
    for (text, pinyin), (reading, failure_reason) in zip(cedict_sources, converted, strict=True):
        if reading is None:
            unresolved[text] = f"cedict-numbered-pinyin-unsupported: {failure_reason}"
            continue
        lookup[text] = {
            "authority": "cedict-unique",
            "evidenceType": "trainer-bopomofo",
            "evidence": reading,
            "sourceEvidenceType": "numbered-pinyin",
            "sourceEvidence": pinyin,
        }

    review_queue = reading_coverage.get("reviewQueue")
    if not isinstance(review_queue, list):
        raise ValueError("reading coverage reviewQueue must be an array")
    for row in review_queue:
        if not isinstance(row, dict):
            raise ValueError("reading coverage review row must be an object")
        text = row.get("text")
        status = row.get("status")
        if not isinstance(text, str) or text not in candidate_texts:
            raise ValueError("reading review contains a non-candidate identity")
        if not isinstance(status, str) or not status:
            raise ValueError("reading review row is missing status")
        unresolved[text] = status

    derive_component_readings(lookup, unresolved, concised_rows)

    if set(lookup) & set(unresolved):
        raise ValueError("resolved and unresolved reading sets overlap")
    if set(lookup) | set(unresolved) != candidate_texts:
        missing = sorted(candidate_texts - set(lookup) - set(unresolved))[:10]
        raise ValueError(f"reading coverage does not partition candidate set; missing={missing}")
    return lookup, unresolved


def load_ud_rows(
    generation: CandidateSet,
    evidence_path: Path | None,
    coverage_path: Path | None,
) -> tuple[dict[str, dict[str, Any]], dict[str, Any] | None]:
    if evidence_path is None and coverage_path is None:
        return {}, None
    if evidence_path is None or coverage_path is None:
        raise ValueError("UD evidence and coverage must be supplied together")
    evidence = load_json(evidence_path)
    coverage = load_json(coverage_path)
    if evidence.get("schemaVersion") != "ud-syntax-evidence-v2":
        raise ValueError("activation generation requires UD syntax evidence v2")
    if evidence.get("candidateCount") != len(generation.records):
        raise ValueError("UD evidence candidate count mismatch")
    rows: dict[str, dict[str, Any]] = {}
    for row in evidence.get("rows", []):
        if not isinstance(row, dict):
            raise ValueError("UD evidence row must be an object")
        text = row.get("text")
        if not isinstance(text, str) or not text or text in rows:
            raise ValueError("UD evidence contains an invalid or duplicate text")
        rows[text] = row
    if set(rows) != set(generation.texts):
        raise ValueError("UD evidence rows do not equal the candidate set")
    if coverage.get("evidenceDigest") != evidence.get("determinismDigest"):
        raise ValueError("UD coverage does not reference the evidence digest")
    return rows, coverage


def project_activation_generation(
    *,
    candidates: Path,
    candidate_manifest: Path,
    reading_coverage_path: Path,
    concised_path: Path,
    revised_path: Path,
    cedict_path: Path,
    active_catalog_path: Path,
    ud_evidence_path: Path | None = None,
    ud_coverage_path: Path | None = None,
) -> dict[str, Any]:
    generation = load_candidate_set(candidates, candidate_manifest, require_manifest=True)
    reading_coverage = load_json(reading_coverage_path)
    concised = load_json(concised_path)
    revised = load_json(revised_path)
    cedict = load_json(cedict_path)
    reading_lookup, unresolved = build_reading_lookup(
        generation,
        reading_coverage,
        concised,
        revised,
        cedict,
    )
    active_identities, active_texts = load_active_catalog(active_catalog_path)
    ud_rows, ud_coverage = load_ud_rows(
        generation,
        ud_evidence_path,
        ud_coverage_path,
    )

    rows: list[dict[str, Any]] = []
    status_counts: dict[str, int] = {}
    authority_counts: dict[str, int] = {}
    for candidate in generation.records:
        reading = reading_lookup.get(candidate.text)
        ud = ud_rows.get(candidate.text)
        if candidate.text in unresolved:
            status = "reading-review-required"
        elif reading is None:
            raise ValueError(f"candidate has no reading partition: {candidate.text}")
        elif (candidate.text, reading["evidence"]) in active_identities:
            status = "already-active-exact-identity"
        elif candidate.text in active_texts:
            status = "resolved-reading-variant"
        else:
            status = "resolved-new-identity"
        status_counts[status] = status_counts.get(status, 0) + 1
        if reading is not None:
            authority = reading["authority"]
            authority_counts[authority] = authority_counts.get(authority, 0) + 1
        row: dict[str, Any] = {
            "generalRank": candidate.general_rank,
            "text": candidate.text,
            "status": status,
            "reading": reading,
            "readingReviewStatus": unresolved.get(candidate.text),
            "alreadyActiveText": candidate.text in active_texts,
        }
        if ud is not None:
            row["syntaxEvidence"] = {
                "observed": bool(ud.get("observed", False)),
                "occurrenceCount": int(ud.get("occurrenceCount", 0)),
                "observedUpos": sorted((ud.get("uposCounts") or {}).keys()),
            }
        rows.append(row)

    core = {
        "candidateCount": len(generation.records),
        "sourceRankLimit": generation.source_rank_limit,
        "statusCounts": {key: status_counts[key] for key in sorted(status_counts)},
        "readingAuthorityCounts": {
            key: authority_counts[key] for key in sorted(authority_counts)
        },
        "udEvidenceIncluded": bool(ud_rows),
        "rows": rows,
    }
    inputs: dict[str, Any] = {
        "candidateGeneration": generation.lineage(),
        "readingCoverage": {
            "path": display_path(reading_coverage_path),
            "checksumSha256": sha256_file(reading_coverage_path),
            "determinismDigest": reading_coverage.get("determinismDigest"),
        },
        "activeCatalog": {
            "path": display_path(active_catalog_path),
            "checksumSha256": sha256_file(active_catalog_path),
            "identityCount": len(active_identities),
        },
    }
    if ud_evidence_path is not None and ud_coverage_path is not None and ud_coverage is not None:
        inputs["udEvidence"] = {
            "path": display_path(ud_evidence_path),
            "checksumSha256": sha256_file(ud_evidence_path),
            "determinismDigest": load_json(ud_evidence_path).get("determinismDigest"),
        }
        inputs["udCoverage"] = {
            "path": display_path(ud_coverage_path),
            "checksumSha256": sha256_file(ud_coverage_path),
            "determinismDigest": ud_coverage.get("determinismDigest"),
        }
    return {
        "adapterVersion": ADAPTER_VERSION,
        "inputs": inputs,
        **core,
        "determinismDigest": canonical_digest(core),
        "policy": {
            "ambiguousReadingSelection": "forbidden",
            "catalogActivationRequiresRuntimeAdmission": False,
            "runtimeAdmissionDecision": "separate downstream artifact",
            "historicalBatchConstants": "not used",
        },
    }


def write_activation_csv(path: Path, report: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as destination:
        writer = csv.DictWriter(
            destination,
            fieldnames=[
                "general_rank",
                "text",
                "status",
                "reading_authority",
                "reading",
                "reading_review_status",
                "ud_occurrence_count",
                "ud_upos",
            ],
        )
        writer.writeheader()
        for row in report["rows"]:
            reading = row.get("reading") or {}
            syntax = row.get("syntaxEvidence") or {}
            writer.writerow({
                "general_rank": row["generalRank"],
                "text": row["text"],
                "status": row["status"],
                "reading_authority": reading.get("authority", ""),
                "reading": reading.get("evidence", ""),
                "reading_review_status": row.get("readingReviewStatus") or "",
                "ud_occurrence_count": syntax.get("occurrenceCount", ""),
                "ud_upos": ";".join(syntax.get("observedUpos", [])),
            })


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--candidates", required=True, type=Path)
    parser.add_argument("--candidate-manifest", required=True, type=Path)
    parser.add_argument("--reading-coverage", required=True, type=Path)
    parser.add_argument("--concised-projection", required=True, type=Path)
    parser.add_argument("--revised-projection", required=True, type=Path)
    parser.add_argument("--cedict-projection", required=True, type=Path)
    parser.add_argument("--active-catalog", required=True, type=Path)
    parser.add_argument("--ud-evidence", type=Path)
    parser.add_argument("--ud-coverage", type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--csv-output", type=Path)
    arguments = parser.parse_args()

    report = project_activation_generation(
        candidates=arguments.candidates,
        candidate_manifest=arguments.candidate_manifest,
        reading_coverage_path=arguments.reading_coverage,
        concised_path=arguments.concised_projection,
        revised_path=arguments.revised_projection,
        cedict_path=arguments.cedict_projection,
        active_catalog_path=arguments.active_catalog,
        ud_evidence_path=arguments.ud_evidence,
        ud_coverage_path=arguments.ud_coverage,
    )
    arguments.output.parent.mkdir(parents=True, exist_ok=True)
    arguments.output.write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    if arguments.csv_output is not None:
        write_activation_csv(arguments.csv_output, report)
    print(
        f"projected {report['candidateCount']} candidates; "
        f"statuses {report['statusCounts']}; "
        f"digest {report['determinismDigest']}"
    )


if __name__ == "__main__":
    main()

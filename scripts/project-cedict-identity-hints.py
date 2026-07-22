#!/usr/bin/env python3
"""Project candidate-scoped identity hints from a local CC-CEDICT release.

The dictionary must be downloaded manually. This adapter validates the exact
local source checksum, supports CC-CEDICT v1 and v2 line syntax, and emits only
small identity hints for candidates still unresolved after both MOE reading
projections. English definitions are parsed only for structured references and
signals; they are never copied into the output artifact.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import unicodedata
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any

ADAPTER_VERSION = "cedict-identity-hints-adapter-v1"
SOURCE_ID = "cc-cedict:manual-release"
LICENSE = "CC BY-SA 4.0"

V2_PATTERN = re.compile(r"^(\S+)\s+(\S+)\s+\[\[([^\]]+)\]\]\s+/(.*)/$")
V1_PATTERN = re.compile(r"^(\S+)\s+(\S+)\s+\[([^\]]+)\]\s+/(.*)/$")
REFERENCE_PATTERN = re.compile(
    r"(?:(?:old|archaic|erhua)\s+)?variant of\s+"
    r"([^|\[\]/;]+)(?:\|([^\[\]/;]+))?\[([^\]]+)\]",
    flags=re.IGNORECASE,
)
PINYIN_TOKEN_PATTERN = re.compile(r"[A-Za-z][A-Za-z0-9:]*")
CHECKSUM_PATTERN = re.compile(r"^[0-9a-f]{64}$")


def normalize_text(value: str) -> str:
    return unicodedata.normalize("NFC", value.strip())


def normalize_pinyin(value: str) -> str:
    return " ".join(value.split())


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_dictionary_source(path: Path, expected_sha256: str) -> tuple[bytes, str | None, bytes]:
    expected = expected_sha256.lower()
    if CHECKSUM_PATTERN.fullmatch(expected) is None:
        raise ValueError("expected SHA-256 must contain exactly 64 lowercase hexadecimal characters")
    source_bytes = path.read_bytes()
    observed = sha256_bytes(source_bytes)
    if observed != expected:
        raise ValueError(f"CC-CEDICT source checksum mismatch: {observed}")

    if zipfile.is_zipfile(path):
        with zipfile.ZipFile(path) as archive:
            members = sorted(
                info.filename
                for info in archive.infolist()
                if not info.is_dir()
                and not Path(info.filename).name.startswith(".")
                and Path(info.filename).suffix.lower() in {".u8", ".txt", ".cedict"}
            )
            if len(members) != 1:
                raise ValueError(
                    "CC-CEDICT ZIP must contain exactly one .u8, .txt, or .cedict data member; "
                    f"found {members!r}"
                )
            member = members[0]
            dictionary_bytes = archive.read(member)
        return source_bytes, member, dictionary_bytes

    return source_bytes, None, source_bytes


@dataclass(frozen=True)
class VariantTarget:
    traditional: str
    simplified: str | None
    pinyin: str


@dataclass(frozen=True)
class CedictEntry:
    source_line: int
    format_version: int
    traditional: str
    simplified: str
    pinyin: str
    variant_targets: tuple[VariantTarget, ...]
    has_classifier_hint: bool
    proper_name_hint: bool


def proper_name_from_pinyin(pinyin: str) -> bool:
    tokens = PINYIN_TOKEN_PATTERN.findall(pinyin)
    return any(token[0].isupper() for token in tokens)


def structured_hints(definition: str) -> tuple[tuple[VariantTarget, ...], bool]:
    targets: list[VariantTarget] = []
    for match in REFERENCE_PATTERN.finditer(definition):
        traditional = normalize_text(match.group(1))
        simplified = normalize_text(match.group(2)) if match.group(2) else None
        pinyin = normalize_pinyin(match.group(3))
        target = VariantTarget(traditional, simplified, pinyin)
        if target not in targets:
            targets.append(target)
    return tuple(targets), "CL:" in definition


def parse_entry_line(line: str, source_line: int) -> CedictEntry:
    match = V2_PATTERN.fullmatch(line)
    format_version = 2
    if match is None:
        match = V1_PATTERN.fullmatch(line)
        format_version = 1
    if match is None:
        raise ValueError(f"invalid CC-CEDICT entry at line {source_line}")

    traditional = normalize_text(match.group(1))
    simplified = normalize_text(match.group(2))
    pinyin = normalize_pinyin(match.group(3))
    definition = match.group(4)
    if not traditional or not simplified or not pinyin:
        raise ValueError(f"incomplete CC-CEDICT entry at line {source_line}")
    variant_targets, has_classifier_hint = structured_hints(definition)
    return CedictEntry(
        source_line=source_line,
        format_version=format_version,
        traditional=traditional,
        simplified=simplified,
        pinyin=pinyin,
        variant_targets=variant_targets,
        has_classifier_hint=has_classifier_hint,
        proper_name_hint=proper_name_from_pinyin(pinyin),
    )


def iter_entries(dictionary_bytes: bytes) -> tuple[list[CedictEntry], dict[str, int]]:
    try:
        text = dictionary_bytes.decode("utf-8-sig")
    except UnicodeDecodeError as error:
        raise ValueError("CC-CEDICT data must be UTF-8") from error

    entries: list[CedictEntry] = []
    counts = {
        "physicalLineCount": 0,
        "commentLineCount": 0,
        "blankLineCount": 0,
        "entryLineCount": 0,
        "v1EntryCount": 0,
        "v2EntryCount": 0,
    }
    for source_line, raw_line in enumerate(text.splitlines(), start=1):
        counts["physicalLineCount"] += 1
        line = raw_line.strip()
        if not line:
            counts["blankLineCount"] += 1
            continue
        if line.startswith("#"):
            counts["commentLineCount"] += 1
            continue
        entry = parse_entry_line(line, source_line)
        entries.append(entry)
        counts["entryLineCount"] += 1
        counts[f"v{entry.format_version}EntryCount"] += 1
    return entries, counts


def candidate_texts(path: Path) -> tuple[list[str], dict[str, int]]:
    values: list[str] = []
    counts: dict[str, int] = {}
    with path.open("r", encoding="utf-8-sig", newline="") as source:
        reader = csv.DictReader(source)
        if reader.fieldnames is None or "text" not in reader.fieldnames:
            raise ValueError("candidate CSV must contain a text column")
        for row_number, row in enumerate(reader, start=2):
            if (row.get("status") or "") == "excluded":
                continue
            text = normalize_text(row.get("text") or "")
            if not text:
                raise ValueError(f"candidate row {row_number} is missing text")
            values.append(text)
            counts[text] = counts.get(text, 0) + 1
    return values, counts


def projection_accepted(path: Path, expected_adapter: str) -> tuple[dict[str, Any], set[str]]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if payload.get("adapterVersion") != expected_adapter:
        raise ValueError(f"unsupported projection adapter in {path}")
    accepted = {normalize_text(row["lookupText"]) for row in payload.get("rows", [])}
    return payload, accepted


def unresolved_after_moe(
    candidate_path: Path,
    concised_projection_path: Path,
    revised_projection_path: Path,
) -> tuple[list[str], set[str], dict[str, Any], dict[str, Any], int]:
    # A candidate text may appear on more than one active-catalog row when it
    # is a real heteronym (multiple active readings); resolution below is
    # already keyed by the distinct text set, so duplicates are expected.
    candidate_items, candidate_counts = candidate_texts(candidate_path)

    concised, concised_accepted = projection_accepted(
        concised_projection_path,
        "moe-concised-reading-adapter-v1",
    )
    revised, revised_accepted = projection_accepted(
        revised_projection_path,
        "moe-revised-reading-fallback-adapter-v1",
    )
    overlap = concised_accepted & revised_accepted
    if overlap:
        raise ValueError(f"MOE Concised and Revised accepted identities overlap: {sorted(overlap)!r}")

    candidate_set = set(candidate_counts)
    all_accepted = concised_accepted | revised_accepted
    if not all_accepted.issubset(candidate_set):
        raise ValueError("MOE projections contain identities outside the candidate set")

    concised_count = concised.get("candidateSet", {}).get("entryCount")
    if concised_count != len(candidate_set):
        raise ValueError("MOE Concised projection candidate entry count mismatch")
    fallback_texts = {
        normalize_text(text)
        for text in revised.get("fallbackBasis", {}).get("fallbackCandidateTexts", [])
    }
    if not revised_accepted.issubset(fallback_texts):
        raise ValueError("MOE Revised accepted identities are outside its fallback basis")

    unresolved = sorted(candidate_set - all_accepted)
    return unresolved, all_accepted, concised, revised, len(candidate_items)


def entry_evidence(entry: CedictEntry, candidate: str) -> dict[str, Any]:
    match_kinds = []
    if entry.traditional == candidate:
        match_kinds.append("traditional")
    if entry.simplified == candidate:
        match_kinds.append("simplified")
    alias_traditional = entry.traditional if entry.simplified == candidate and entry.traditional != candidate else None
    return {
        "sourceLine": entry.source_line,
        "formatVersion": entry.format_version,
        "traditional": entry.traditional,
        "simplified": entry.simplified,
        "pinyin": entry.pinyin,
        "matchKinds": match_kinds,
        "canonicalTraditionalHint": alias_traditional,
        "variantTargets": [
            {
                "traditional": target.traditional,
                "simplified": target.simplified,
                "pinyin": target.pinyin,
            }
            for target in entry.variant_targets
        ],
        "hasClassifierHint": entry.has_classifier_hint,
        "properNameHint": entry.proper_name_hint,
    }


def project_identity_hints(
    dictionary_path: Path,
    expected_sha256: str,
    source_version: str,
    candidate_path: Path,
    concised_projection_path: Path,
    revised_projection_path: Path,
) -> dict[str, Any]:
    source_bytes, archive_member, dictionary_bytes = read_dictionary_source(
        dictionary_path,
        expected_sha256,
    )
    entries, source_counts = iter_entries(dictionary_bytes)
    unresolved, moe_accepted, concised, revised, candidate_count = unresolved_after_moe(
        candidate_path,
        concised_projection_path,
        revised_projection_path,
    )
    target_set = set(unresolved)

    index: dict[str, list[CedictEntry]] = {text: [] for text in unresolved}
    for entry in entries:
        if entry.traditional in target_set:
            index[entry.traditional].append(entry)
        if entry.simplified in target_set and entry.simplified != entry.traditional:
            index[entry.simplified].append(entry)

    rows: list[dict[str, Any]] = []
    unmatched: list[str] = []
    ambiguous: list[str] = []
    unique: list[str] = []
    for candidate in unresolved:
        records = sorted(
            index[candidate],
            key=lambda item: (item.traditional, item.simplified, item.pinyin, item.source_line),
        )
        if not records:
            unmatched.append(candidate)
            continue
        status = "unique-record" if len(records) == 1 else "ambiguous-records"
        (unique if len(records) == 1 else ambiguous).append(candidate)
        rows.append(
            {
                "lookupText": candidate,
                "status": status,
                "records": [entry_evidence(entry, candidate) for entry in records],
            }
        )

    matched_source_lines = {
        entry.source_line
        for candidate in unresolved
        for entry in index[candidate]
    }

    return {
        "adapterVersion": ADAPTER_VERSION,
        "source": {
            "sourceId": SOURCE_ID,
            "sourceVersion": source_version,
            "sourceChecksumSha256": sha256_bytes(source_bytes),
            "sourceByteSize": len(source_bytes),
            "archiveMember": archive_member,
            "dictionaryByteSize": len(dictionary_bytes),
            "license": LICENSE,
            "acquisitionBoundary": "manual local download only; automated MDBG access is not performed",
            "format": {
                "supportedVersions": [1, 2],
                **source_counts,
            },
            "emittedFields": (
                "traditional/simplified/pinyin and structured identity hints only; "
                "English definitions are not emitted"
            ),
        },
        "resolutionBasis": {
            "candidateEntryCount": candidate_count,
            "moeConcisedAdapterVersion": concised["adapterVersion"],
            "moeConcisedSourceVersion": concised["source"]["sourceVersion"],
            "moeRevisedAdapterVersion": revised["adapterVersion"],
            "moeRevisedSourceVersion": revised["source"]["sourceVersion"],
            "moeAcceptedCandidateCount": len(moe_accepted),
            "cedictTargetCount": len(unresolved),
            "cedictTargetTexts": unresolved,
            "authorityRule": "CC-CEDICT targets only identities unresolved after both MOE projections",
        },
        "rows": rows,
        "diagnostics": {
            "uniqueRecordTexts": unique,
            "ambiguousRecordTexts": ambiguous,
            "unmatchedTexts": unmatched,
            "matchedTargetCount": len(rows),
            "omittedNonTargetEntryCount": len(entries) - len(matched_source_lines),
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dictionary", required=True, type=Path)
    parser.add_argument("--expected-sha256", required=True)
    parser.add_argument("--source-version", required=True)
    parser.add_argument("--candidates", default=Path("data/source/words.sample.csv"), type=Path)
    parser.add_argument(
        "--concised-projection",
        default=Path("data/readings/moe-concised-2014_20260626-active-catalog.json"),
        type=Path,
    )
    parser.add_argument(
        "--revised-projection",
        default=Path("data/readings/moe-revised-2015_20260625-active-catalog-fallback.json"),
        type=Path,
    )
    parser.add_argument(
        "--output",
        default=Path("data/identity/cedict-active-catalog-hints.json"),
        type=Path,
    )
    arguments = parser.parse_args()
    payload = project_identity_hints(
        arguments.dictionary,
        arguments.expected_sha256,
        arguments.source_version,
        arguments.candidates,
        arguments.concised_projection,
        arguments.revised_projection,
    )
    arguments.output.parent.mkdir(parents=True, exist_ok=True)
    arguments.output.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    diagnostics = payload["diagnostics"]
    print(
        "wrote "
        f"{diagnostics['matchedTargetCount']} candidate-scoped CEDICT hint rows; "
        f"{len(diagnostics['ambiguousRecordTexts'])} ambiguous; "
        f"{len(diagnostics['unmatchedTexts'])} unmatched"
    )


if __name__ == "__main__":
    main()

from __future__ import annotations

import csv
import hashlib
import json
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterator, Mapping

ADAPTER_VERSION = "ud-chinese-gsd-grammar-evidence-adapter-v2"
EVIDENCE_SCHEMA_VERSION = "ud-syntax-evidence-v2"
SOURCE_ID = "ud:chinese-gsd-r2.18"
SOURCE_RELEASE = "r2.18"
SOURCE_REPOSITORY = "https://github.com/UniversalDependencies/UD_Chinese-GSD"
SOURCE_LICENSE = "CC BY-SA 4.0"

DEFAULT_CANDIDATES = Path("data/lexicon/naer-1141208-top-1000-candidates.csv")
DEFAULT_SOURCE_DIR = Path("data/external/ud/chinese-gsd/r2.18")
DEFAULT_EVIDENCE_OUTPUT = Path(
    "data/grammar/ud-chinese-gsd-r2.18-naer-top-1000-evidence.json"
)
DEFAULT_COVERAGE_OUTPUT = Path(
    "data/grammar/ud-chinese-gsd-r2.18-naer-top-1000-coverage.json"
)
EXPECTED_CANDIDATE_COUNT = 1_000
EXPECTED_CANDIDATE_CANONICAL_SHA256 = (
    "a47bdf18e0cd9d33784c9c868066ab64e56ef92c4c5360ba5cf579458d0dd710"
)
EXPECTED_FILES: Mapping[str, Mapping[str, Any]] = {
    "zh_gsd-ud-train.conllu": {
        "split": "train",
        "byteSize": 9_318_330,
        "sha256": "de36e605a4786edb00097165cfc0ee425ab668a2dfc1da7ce4652ba4d2585b1e",
    },
    "zh_gsd-ud-dev.conllu": {
        "split": "dev",
        "byteSize": 1_195_021,
        "sha256": "09374c8361400861a536ae94a1d7710e1cdd72285c32b9764d94d2d956b4ae02",
    },
    "zh_gsd-ud-test.conllu": {
        "split": "test",
        "byteSize": 1_136_344,
        "sha256": "ff01a3d01d62b623756396085e78bdaeefb7c2b7935a890dde5b18e92712d54f",
    },
}

SUPPORTED_UPOS = (
    "ADJ",
    "ADP",
    "ADV",
    "AUX",
    "CCONJ",
    "DET",
    "INTJ",
    "NOUN",
    "NUM",
    "PART",
    "PRON",
    "PROPN",
    "PUNCT",
    "SCONJ",
    "SYM",
    "VERB",
    "X",
)
SIGNIFICANT_UPOS_MIN_COUNT = 2
SIGNIFICANT_UPOS_MIN_SHARE = 0.10
MIXED_VALENCY_MIN_COUNT = 2
MIXED_VALENCY_MIN_SHARE = 0.10
SUBJECT_RELATIONS = {"nsubj", "csubj"}
OBJECT_RELATIONS = {"obj", "iobj"}
VALENCY_RELATIONS = {
    "nsubj",
    "csubj",
    "obj",
    "iobj",
    "ccomp",
    "xcomp",
    "obl",
    "advcl",
    "acl",
}
STRUCTURAL_RELATIONS = {"cop", "aux", "mark", "case", "cc", "conj"}
SCHEMA_GAP_UPOS = ("ADP", "CCONJ", "DET", "NUM", "PART", "SCONJ")


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def canonical_text_sha256(path: Path) -> str:
    text = path.read_text(encoding="utf-8-sig")
    canonical = text.replace("\r\n", "\n").replace("\r", "\n").encode("utf-8")
    return sha256_bytes(canonical)


def canonical_digest(value: Any) -> str:
    encoded = json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return sha256_bytes(encoded)


def canonical_json(value: Any) -> str:
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as destination:
        json.dump(payload, destination, ensure_ascii=False, indent=2)
        destination.write("\n")


def sorted_counter(counter: Counter[str]) -> dict[str, int]:
    return {key: counter[key] for key in sorted(counter)}


@dataclass(frozen=True)
class Candidate:
    text: str
    general_rank: int


@dataclass(frozen=True)
class Token:
    identifier: int
    form: str
    lemma: str
    upos: str
    xpos: str
    feats: str
    head: int
    deprel: str


@dataclass
class SyntaxProfileObservation:
    occurrence_count: int = 0
    deprel: Counter[str] = field(default_factory=Counter)
    features: Counter[str] = field(default_factory=Counter)
    parent_upos: Counter[str] = field(default_factory=Counter)
    head_directions: Counter[str] = field(default_factory=Counter)
    surface_positions: Counter[str] = field(default_factory=Counter)
    child_relations: Counter[str] = field(default_factory=Counter)
    child_direction_relations: Counter[str] = field(default_factory=Counter)
    child_relation_multisets: Counter[str] = field(default_factory=Counter)
    valency_relations: Counter[str] = field(default_factory=Counter)
    valency_signatures: Counter[str] = field(default_factory=Counter)
    construction_relations: Counter[str] = field(default_factory=Counter)
    anonymous_skeletons: Counter[str] = field(default_factory=Counter)
    root_count: int = 0


@dataclass
class Observation(SyntaxProfileObservation):
    source_occurrences: Counter[str] = field(default_factory=Counter)
    upos: Counter[str] = field(default_factory=Counter)
    xpos: Counter[str] = field(default_factory=Counter)
    profile_observations: dict[str, SyntaxProfileObservation] = field(default_factory=dict)
    lemma_agreement_count: int = 0
    lemma_mismatch_count: int = 0
    lemma_missing_count: int = 0
    lemmas: set[str] = field(default_factory=set)
    verbal_occurrence_count: int = 0
    with_subject_dependent_count: int = 0
    with_object_dependent_count: int = 0
    with_subject_and_object_dependent_count: int = 0
    without_object_dependent_count: int = 0
    subject_dependent_token_count: int = 0
    object_dependent_token_count: int = 0


@dataclass
class SourceStats:
    filename: str
    split: str
    byte_size: int
    checksum_sha256: str
    sentence_count: int = 0
    syntactic_token_count: int = 0
    multiword_token_line_count: int = 0
    empty_node_line_count: int = 0
    candidate_match_count: int = 0
    observed_candidates: set[str] = field(default_factory=set)


def load_candidates(
    path: Path,
    expected_count: int,
    expected_checksum: str,
) -> list[Candidate]:
    checksum = canonical_text_sha256(path)
    if checksum != expected_checksum:
        raise ValueError(f"candidate CSV canonical checksum mismatch: {checksum}")
    candidates: list[Candidate] = []
    seen_texts: set[str] = set()
    seen_ranks: set[int] = set()
    with path.open("r", encoding="utf-8-sig", newline="") as source:
        reader = csv.DictReader(source)
        required = {"text", "status", "naer_general_rank"}
        if reader.fieldnames is None or not required.issubset(reader.fieldnames):
            raise ValueError(f"candidate CSV must contain {sorted(required)!r}")
        for row_number, row in enumerate(reader, start=2):
            text = (row.get("text") or "").strip()
            rank_source = (row.get("naer_general_rank") or "").strip()
            if not text:
                raise ValueError(f"candidate row {row_number} is missing text")
            if not rank_source.isdigit() or int(rank_source) <= 0:
                raise ValueError(f"candidate row {row_number} has invalid rank")
            rank = int(rank_source)
            if text in seen_texts:
                raise ValueError(f"duplicate candidate text: {text}")
            if rank in seen_ranks:
                raise ValueError(f"duplicate candidate rank: {rank}")
            seen_texts.add(text)
            seen_ranks.add(rank)
            candidates.append(Candidate(text=text, general_rank=rank))
    candidates.sort(key=lambda item: item.general_rank)
    if len(candidates) != expected_count:
        raise ValueError(f"expected {expected_count} candidates, found {len(candidates)}")
    if [item.general_rank for item in candidates] != list(range(1, expected_count + 1)):
        raise ValueError(f"candidate ranks must form a continuous 1..{expected_count} prefix")
    return candidates


def validate_source_file(
    path: Path,
    expected_files: Mapping[str, Mapping[str, Any]],
) -> str:
    expected = expected_files.get(path.name)
    if expected is None:
        raise ValueError(f"unsupported UD source file: {path.name}")
    byte_size = path.stat().st_size
    if byte_size != expected["byteSize"]:
        raise ValueError(f"UD source size mismatch for {path.name}: {byte_size}")
    checksum = sha256_file(path)
    if checksum != expected["sha256"]:
        raise ValueError(f"UD source checksum mismatch for {path.name}: {checksum}")
    return str(expected["split"])


def parse_token_line(line: str, path: Path, line_number: int) -> tuple[str, Token | None]:
    columns = line.split("\t")
    if len(columns) != 10:
        raise ValueError(
            f"{path}:{line_number}: expected 10 CoNLL-U columns, found {len(columns)}"
        )
    identifier = columns[0]
    if "-" in identifier:
        return "multiword", None
    if "." in identifier:
        return "empty-node", None
    if not identifier.isdigit():
        raise ValueError(f"{path}:{line_number}: invalid token ID {identifier!r}")
    if not columns[6].isdigit():
        raise ValueError(f"{path}:{line_number}: invalid HEAD {columns[6]!r}")
    return "token", Token(
        identifier=int(identifier),
        form=columns[1],
        lemma=columns[2],
        upos=columns[3],
        xpos=columns[4],
        feats=columns[5],
        head=int(columns[6]),
        deprel=columns[7],
    )


def iter_sentences(path: Path, stats: SourceStats) -> Iterator[list[Token]]:
    sentence: list[Token] = []
    with path.open("r", encoding="utf-8", newline="") as source:
        for line_number, raw_line in enumerate(source, start=1):
            line = raw_line.rstrip("\r\n")
            if not line:
                if sentence:
                    stats.sentence_count += 1
                    yield sentence
                    sentence = []
                continue
            if line.startswith("#"):
                continue
            kind, token = parse_token_line(line, path, line_number)
            if kind == "multiword":
                stats.multiword_token_line_count += 1
            elif kind == "empty-node":
                stats.empty_node_line_count += 1
            elif token is not None:
                if token.upos not in SUPPORTED_UPOS:
                    raise ValueError(f"unsupported UPOS {token.upos!r} in {path}:{line_number}")
                stats.syntactic_token_count += 1
                sentence.append(token)
    if sentence:
        stats.sentence_count += 1
        yield sentence

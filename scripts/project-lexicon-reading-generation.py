#!/usr/bin/env python3
"""Run the manifest-linked reading pipeline for any ranked candidate generation."""

from __future__ import annotations

import argparse
import importlib.util
import json
import sys
from pathlib import Path
from types import ModuleType
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from lexicon_candidate_set import CandidateSet, load_candidate_set


def load_script_module(name: str, filename: str) -> ModuleType:
    path = SCRIPT_DIR / filename
    specification = importlib.util.spec_from_file_location(name, path)
    if specification is None or specification.loader is None:
        raise RuntimeError(f"cannot load adapter: {path}")
    module = importlib.util.module_from_spec(specification)
    sys.modules[specification.name] = module
    specification.loader.exec_module(module)
    return module


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def attach_candidate_lineage(
    payload: dict[str, Any],
    generation: CandidateSet,
    section: str,
) -> None:
    target = payload.get(section)
    if not isinstance(target, dict):
        raise ValueError(f"projection is missing {section}")
    target["candidateManifestLineage"] = generation.lineage()


def project_reading_generation(
    *,
    candidates: Path,
    candidate_manifest: Path,
    concised_archive: Path,
    concised_output: Path,
    revised_archive: Path,
    revised_output: Path,
    cedict_dictionary: Path,
    cedict_expected_sha256: str,
    cedict_source_version: str,
    cedict_output: Path,
    coverage_output: Path,
) -> dict[str, Any]:
    generation = load_candidate_set(candidates, candidate_manifest, require_manifest=True)
    concised_adapter = load_script_module(
        "project_moe_concised_readings_generation",
        "project-moe-concised-readings.py",
    )
    revised_adapter = load_script_module(
        "project_moe_revised_readings_generation",
        "project-moe-revised-readings.py",
    )
    cedict_adapter = load_script_module(
        "project_cedict_identity_hints_generation",
        "project-cedict-identity-hints.py",
    )
    coverage_adapter = load_script_module(
        "summarize_naer_reading_coverage_generation",
        "summarize-naer-reading-coverage.py",
    )

    concised = concised_adapter.project_candidate_readings(concised_archive, candidates)
    attach_candidate_lineage(concised, generation, "candidateSet")
    write_json(concised_output, concised)

    revised = revised_adapter.project_revised_fallback(
        revised_archive,
        candidates,
        concised_output,
    )
    attach_candidate_lineage(revised, generation, "fallbackBasis")
    write_json(revised_output, revised)

    cedict = cedict_adapter.project_identity_hints(
        cedict_dictionary,
        cedict_expected_sha256,
        cedict_source_version,
        candidates,
        concised_output,
        revised_output,
    )
    attach_candidate_lineage(cedict, generation, "resolutionBasis")
    write_json(cedict_output, cedict)

    coverage = coverage_adapter.summarize_coverage(
        candidates,
        concised_output,
        revised_output,
        cedict_output,
        candidate_manifest,
    )
    write_json(coverage_output, coverage)

    return {
        "candidateCount": len(generation.records),
        "sourceRankLimit": generation.source_rank_limit,
        "concisedAcceptedCount": len(concised.get("rows", [])),
        "revisedAcceptedCount": len(revised.get("rows", [])),
        "cedictMatchedCount": len(cedict.get("rows", [])),
        "automaticallyResolved": coverage["coverage"]["automaticallyResolved"],
        "reviewRequired": coverage["coverage"]["reviewRequired"],
        "coverageDigest": coverage["determinismDigest"],
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--candidates", required=True, type=Path)
    parser.add_argument("--candidate-manifest", required=True, type=Path)
    parser.add_argument("--concised-archive", required=True, type=Path)
    parser.add_argument("--concised-output", required=True, type=Path)
    parser.add_argument("--revised-archive", required=True, type=Path)
    parser.add_argument("--revised-output", required=True, type=Path)
    parser.add_argument("--cedict-dictionary", required=True, type=Path)
    parser.add_argument("--cedict-expected-sha256", required=True)
    parser.add_argument("--cedict-source-version", required=True)
    parser.add_argument("--cedict-output", required=True, type=Path)
    parser.add_argument("--coverage-output", required=True, type=Path)
    arguments = parser.parse_args()

    summary = project_reading_generation(
        candidates=arguments.candidates,
        candidate_manifest=arguments.candidate_manifest,
        concised_archive=arguments.concised_archive,
        concised_output=arguments.concised_output,
        revised_archive=arguments.revised_archive,
        revised_output=arguments.revised_output,
        cedict_dictionary=arguments.cedict_dictionary,
        cedict_expected_sha256=arguments.cedict_expected_sha256,
        cedict_source_version=arguments.cedict_source_version,
        cedict_output=arguments.cedict_output,
        coverage_output=arguments.coverage_output,
    )
    print(json.dumps(summary, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()

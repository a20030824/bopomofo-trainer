#!/usr/bin/env python3
"""Stable entrypoint for the transient NAER workbook inspector."""

from __future__ import annotations

import importlib.util
import json
import sys
import warnings
from pathlib import Path
from types import ModuleType
from typing import Any


def load_inspector() -> ModuleType:
    path = Path(__file__).with_name("inspect-naer-frequency-workbook.py")
    specification = importlib.util.spec_from_file_location("naer_frequency_workbook_inspector", path)
    if specification is None or specification.loader is None:
        raise RuntimeError(f"cannot load inspector: {path}")
    module = importlib.util.module_from_spec(specification)
    sys.modules[specification.name] = module
    specification.loader.exec_module(module)
    return module


def display(value: Any) -> str:
    return "—" if value is None else str(value)


def render_markdown(report: dict[str, Any]) -> str:
    source = report["source"]
    workbook = report["workbook"]
    lines = [
        "# NAER general-frequency workbook inspection",
        "",
        "> Structural inspection only. The official workbook and lexical rows are not committed or published.",
        "",
        "## Source provenance",
        "",
        f"- Requested URL: `{source['requestedUrl']}`",
        f"- Resolved URL: `{source['resolvedUrl']}`",
        f"- Retrieved at: `{source['retrievedAt']}`",
        f"- Observed filename: `{source['observedFilename']}`",
        f"- Bytes: `{source['byteSize']}`",
        f"- SHA-256: `{source['checksumSha256']}`",
        f"- Content type: `{source['contentType']}`",
        "- Redistribution status: `local-only-pending-license-review`",
        "",
        "## Workbook summary",
        "",
        f"- ZIP member count: `{workbook['zipMemberCount']}`",
        f"- Shared string count: `{workbook['sharedStringCount']}`",
        f"- Sheet count: `{len(report['sheets'])}`",
        f"- Defined-name count: `{len(workbook['properties']['definedNames'])}`",
        "",
    ]
    for sheet in report["sheets"]:
        lines.extend(
            [
                f"## Sheet: {sheet.get('name') or '(unnamed)'}",
                "",
                f"- State: `{display(sheet.get('state'))}`",
                f"- Path: `{display(sheet.get('path'))}`",
                f"- Dimension: `{display(sheet.get('dimensionReference'))}`",
                f"- Detected header row: `{display(sheet.get('detectedHeaderRow'))}`",
                f"- Physical row elements: `{display(sheet.get('physicalRowElementCount'))}`",
                f"- Data rows after header: `{display(sheet.get('dataRowCountAfterDetectedHeader'))}`",
                f"- Duplicate data rows: `{display(sheet.get('duplicateDataRowCount'))}`",
                f"- Blank row elements: `{display(sheet.get('blankRowElementCount'))}`",
                f"- Hidden rows: `{display(sheet.get('hiddenRowCount'))}`",
                f"- Formula count: `{display(sheet.get('formulaCount'))}`",
                f"- Merged ranges: `{display(sheet.get('mergedRangeCount'))}`",
                f"- Tables: `{display(sheet.get('tableCount'))}`",
                "",
                "### Headers",
                "",
            ]
        )
        for header in sheet.get("headers", []):
            lines.append(f"- `{header['column']}`: `{header['label']}`")
        lines.extend(
            [
                "",
                "### Aggregate column profile",
                "",
                "| Col | Header | Present | Blank | Numeric | Zero | String | Formula | Min | Max | Suggested semantics |",
                "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
            ]
        )
        for item in sheet.get("columns", []):
            semantics = ", ".join(item["headerSemanticsSuggested"]) or "—"
            header = (item["header"] or "—").replace("|", "\\|")
            lines.append(
                f"| {item['column']} | {header} | {item['presentCount']} | {item['blankCount']} | "
                f"{item['numericCount']} | {item['zeroCount']} | {item['stringCount']} | "
                f"{item['formulaCount']} | {display(item['numericMinimum'])} | "
                f"{display(item['numericMaximum'])} | {semantics} |"
            )
        lines.append("")
    sufficiency = report["productModelSufficiency"]
    lines.extend(
        [
            "## First-product commonness gate",
            "",
            f"- Decision: **{sufficiency['decision']}**",
            f"- Lexical identity candidate: `{sufficiency['lexicalIdentityHeaderCandidatePresent']}`",
            f"- Spoken frequency candidate: `{sufficiency['spokenFrequencyHeaderCandidatePresent']}`",
            f"- Written frequency candidate: `{sufficiency['writtenFrequencyHeaderCandidatePresent']}`",
            f"- General frequency candidate: `{sufficiency['generalFrequencyHeaderCandidatePresent']}`",
            "- Header matching is structural evidence only; semantic adoption still requires manual review.",
            "",
            "## Machine-readable structural report",
            "",
            "The complete aggregate report is committed separately as JSON. It contains no lexical rows.",
            "",
            "```json",
            json.dumps(report["privacyBoundary"], ensure_ascii=False, indent=2),
            "```",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> None:
    warnings.filterwarnings("ignore", category=DeprecationWarning)
    inspector = load_inspector()
    inspector.render_markdown = render_markdown
    inspector.main()


if __name__ == "__main__":
    main()

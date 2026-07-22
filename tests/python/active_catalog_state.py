"""Read the current active catalog's real size from committed files.

Tests that assert catalog-derived counts should read them from here instead
of hardcoding a literal that a future activation batch would silently make
stale.
"""

from __future__ import annotations

import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ACTIVE_WORDS = ROOT / "data" / "source" / "words.sample.csv"
ACTIVE_CONCISED = ROOT / "data" / "readings" / "moe-concised-2014_20260626-active-catalog.json"
ACTIVE_REVISED = ROOT / "data" / "readings" / "moe-revised-2015_20260625-active-catalog-fallback.json"


def active_catalog_size() -> int:
    with ACTIVE_WORDS.open("r", encoding="utf-8-sig", newline="") as source:
        return sum(1 for _ in csv.DictReader(source))


def active_catalog_text_count() -> int:
    """Distinct texts in the active catalog. A text may have more than one
    row when it is a real heteronym (multiple active readings), so this can
    be smaller than `active_catalog_size()`, which counts rows.
    """
    with ACTIVE_WORDS.open("r", encoding="utf-8-sig", newline="") as source:
        return len({row["text"] for row in csv.DictReader(source)})


def active_concised_count() -> int:
    payload = json.loads(ACTIVE_CONCISED.read_text(encoding="utf-8"))
    return len(payload["rows"])


def active_revised_count() -> int:
    payload = json.loads(ACTIVE_REVISED.read_text(encoding="utf-8"))
    return len(payload["rows"])

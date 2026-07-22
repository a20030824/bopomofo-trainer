from __future__ import annotations

import csv
import json
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))

from catalog_activation import convert_numbered_pinyin  # noqa: E402


class HeteronymActivationRegressionTest(unittest.TestCase):
    def test_active_ambiguous_texts_include_every_distinct_reading(self) -> None:
        with (ROOT / "data/source/words.sample.csv").open(
            "r", encoding="utf-8-sig", newline=""
        ) as source:
            active_rows = list(csv.DictReader(source))
        active: dict[str, set[str]] = {}
        for row in active_rows:
            active.setdefault(row["text"], set()).add(row["reading"])

        payload = json.loads(
            (ROOT / "data/identity/cedict-2026-07-21-naer-top-1000-hints.json")
            .read_text(encoding="utf-8")
        )
        ambiguous = {
            row["lookupText"]: row["records"]
            for row in payload["rows"]
            if row.get("status") == "ambiguous-records"
        }
        active_ambiguous = sorted(set(active) & set(ambiguous))
        self.assertTrue(active_ambiguous)

        pinyin = [
            record["pinyin"]
            for text in active_ambiguous
            for record in ambiguous[text]
        ]
        converted = iter(convert_numbered_pinyin(pinyin))
        expected: dict[str, set[str]] = {text: set() for text in active_ambiguous}
        for text in active_ambiguous:
            for _record in ambiguous[text]:
                expected[text].add(next(converted))

        missing = {
            text: sorted(readings - active[text])
            for text, readings in expected.items()
            if not readings.issubset(active[text])
        }
        self.assertEqual(missing, {})


if __name__ == "__main__":
    unittest.main()

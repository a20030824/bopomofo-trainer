from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))

import activate_reviewed_catalog_entries_26_50 as activation  # noqa: E402
import catalog_activation  # noqa: E402
from activation_report_assertions import validate_historical_activation_report  # noqa: E402

EXPECTED_APPROVED_TEXTS = [
    "重要", "美國", "中國", "政府", "社會", "世界", "活動", "公司", "民眾", "不同",
    "關係", "能夠", "不能", "事情", "最後", "國家", "方式", "必須", "走", "環境",
]


class ActivateReviewedCatalogEntries2650Test(unittest.TestCase):
    def test_locked_review_decisions_resolve_twenty_entries(self) -> None:
        approved, held, validation = catalog_activation.load_review_decisions(
            activation.BATCH,
            catalog_activation.DEFAULT_BATCH,
            catalog_activation.DEFAULT_DECISION_REPORT,
        )
        self.assertEqual([row["text"] for row in approved], EXPECTED_APPROVED_TEXTS)
        self.assertEqual(len(approved), 20)
        self.assertEqual(len(held), 5)
        self.assertEqual(validation["approvedCount"], 20)
        self.assertEqual(
            {row["reading_authority"] for row in approved},
            {"moe-concised", "moe-revised"},
        )

    def test_baseline_state_chains_from_the_first_activation_report(self) -> None:
        baseline_count, reading_counts = catalog_activation.resolve_baseline_state(
            activation.BATCH
        )
        self.assertEqual(baseline_count, 60)
        self.assertEqual(
            reading_counts,
            {"moe-concised": 52, "moe-revised": 2, "cedict": 4, "manual": 2},
        )

    def test_historical_activation_report_is_internally_locked(self) -> None:
        if not activation.DEFAULT_OUTPUT_REPORT.exists():
            self.skipTest("reviewed-20 activation artifacts are not committed yet")
        report = validate_historical_activation_report(
            activation.BATCH, activation.DEFAULT_OUTPUT_REPORT
        )
        self.assertEqual(report["activeCount"], 80)
        self.assertEqual(report["activatedCount"], 20)
        self.assertEqual(
            report["readingAuthorityCounts"],
            {"moe-concised": 70, "moe-revised": 4, "cedict": 4, "manual": 2},
        )
        current_rows = catalog_activation.load_csv(
            catalog_activation.DEFAULT_WORDS, catalog_activation.WORDS_FIELDS
        )
        self.assertGreater(len(current_rows), report["activeCount"])


if __name__ == "__main__":
    unittest.main()

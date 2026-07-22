from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))

import activate_reviewed_catalog_entries_51_100 as activation  # noqa: E402
import catalog_activation  # noqa: E402

EXPECTED_APPROVED_TEXTS = [
    "文化", "大陸", "大學", "目前", "部分", "日本", "未來", "學校", "經濟",
    "當時", "過程", "感覺", "結果", "後來", "機會", "故事", "變成", "先生",
    "同時", "市場", "中心", "狀況", "身體", "生命", "歷史", "電影", "人員",
    "家庭", "經驗", "能力", "政治", "企業", "總統", "進入",
]


class ActivateReviewedCatalogEntries51100Test(unittest.TestCase):
    def test_locked_review_decisions_resolve_thirty_four_entries(self) -> None:
        approved, held, validation = catalog_activation.load_review_decisions(
            activation.BATCH,
            catalog_activation.DEFAULT_BATCH,
            catalog_activation.DEFAULT_DECISION_REPORT,
        )
        self.assertEqual([row["text"] for row in approved], EXPECTED_APPROVED_TEXTS)
        self.assertEqual(len(approved), 34)
        self.assertEqual(len(held), 16)
        self.assertEqual(validation["approvedCount"], 34)
        self.assertEqual(
            {row["reading_authority"] for row in approved},
            {"moe-concised", "moe-revised"},
        )

    def test_baseline_state_chains_from_the_second_activation_report(self) -> None:
        baseline_count, reading_counts = catalog_activation.resolve_baseline_state(
            activation.BATCH
        )
        self.assertEqual(baseline_count, 80)
        self.assertEqual(
            reading_counts,
            {"moe-concised": 70, "moe-revised": 4, "cedict": 4, "manual": 2},
        )

    def test_committed_activation_report_is_locked(self) -> None:
        if not activation.DEFAULT_OUTPUT_REPORT.exists():
            self.skipTest("reviewed-34 activation artifacts are not committed yet")
        report = catalog_activation.validate_committed_activation(
            activation.BATCH, activation.DEFAULT_OUTPUT_REPORT
        )
        self.assertEqual(report["activeCount"], 114)
        self.assertEqual(report["activatedCount"], 34)
        self.assertEqual(
            report["readingAuthorityCounts"],
            {"moe-concised": 101, "moe-revised": 7, "cedict": 4, "manual": 2},
        )


if __name__ == "__main__":
    unittest.main()

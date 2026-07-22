from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))

import activate_reviewed_catalog_entries_51_100 as activation  # noqa: E402


class ActivateReviewedCatalogEntries51100Test(unittest.TestCase):
    def test_locked_review_decisions_resolve_thirty_four_entries(self) -> None:
        approved, held, validation = activation.load_review_decisions(
            activation.DEFAULT_BATCH,
            activation.DEFAULT_DECISION_REPORT,
            activation.DEFAULT_DECISIONS,
        )
        self.assertEqual([row["text"] for row in approved], activation.EXPECTED_APPROVED_TEXTS)
        self.assertEqual(len(approved), 34)
        self.assertEqual(len(held), 16)
        self.assertEqual(validation["approvedCount"], 34)
        self.assertEqual(
            {row["reading_authority"] for row in approved},
            {"moe-concised", "moe-revised"},
        )

    def test_activation_state_rejects_partial_promotion(self) -> None:
        baseline = [{"text": f"base-{index}"} for index in range(80)]
        self.assertEqual(
            activation.activation_state(
                baseline,
                key="text",
                approved_texts=activation.EXPECTED_APPROVED_TEXTS,
                label="fixture",
            ),
            "baseline",
        )
        activated = [
            *baseline,
            *({"text": text} for text in activation.EXPECTED_APPROVED_TEXTS),
        ]
        self.assertEqual(
            activation.activation_state(
                activated,
                key="text",
                approved_texts=activation.EXPECTED_APPROVED_TEXTS,
                label="fixture",
            ),
            "activated",
        )
        with self.assertRaisesRegex(ValueError, "partial activation"):
            activation.activation_state(
                [*baseline, {"text": activation.EXPECTED_APPROVED_TEXTS[0]}],
                key="text",
                approved_texts=activation.EXPECTED_APPROVED_TEXTS,
                label="fixture",
            )

    def test_committed_activation_report_is_locked(self) -> None:
        if not activation.DEFAULT_OUTPUT_REPORT.exists():
            self.skipTest("reviewed-34 activation artifacts are not committed yet")
        report = activation.validate_committed_activation()
        self.assertEqual(report["activeCount"], 114)
        self.assertEqual(report["activatedCount"], 34)
        self.assertEqual(report["readingAuthorityCounts"], activation.EXPECTED_READING_COUNTS)


if __name__ == "__main__":
    unittest.main()

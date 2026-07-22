from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))

import activate_reviewed_catalog_entries_26_50 as activation  # noqa: E402


class ActivateReviewedCatalogEntries2650Test(unittest.TestCase):
    def test_locked_review_decisions_resolve_twenty_entries(self) -> None:
        approved, held, validation = activation.load_review_decisions(
            activation.DEFAULT_BATCH,
            activation.DEFAULT_DECISION_REPORT,
            activation.DEFAULT_DECISIONS,
        )
        self.assertEqual([row["text"] for row in approved], activation.EXPECTED_APPROVED_TEXTS)
        self.assertEqual(len(approved), 20)
        self.assertEqual(len(held), 5)
        self.assertEqual(validation["approvedCount"], 20)
        self.assertEqual(
            {row["reading_authority"] for row in approved},
            {"moe-concised", "moe-revised"},
        )

    def test_activation_state_rejects_partial_promotion(self) -> None:
        baseline = [{"text": f"base-{index}"} for index in range(60)]
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

    def test_revised_projection_adds_china_and_united_states(self) -> None:
        approved = [
            {
                "text": "美國",
                "reading_authority": "moe-revised",
                "reading_evidence": "ㄇㄟ3 ㄍㄨㄛ2",
            },
            {
                "text": "中國",
                "reading_authority": "moe-revised",
                "reading_evidence": "ㄓㄨㄥ1 ㄍㄨㄛ2",
            },
        ]
        active_texts = {
            *(f"concised-{index}" for index in range(70)),
            "中文",
            "謝謝",
            "美國",
            "中國",
            "target-a",
            "target-b",
            "target-c",
            "target-d",
            "target-e",
            "target-f",
        }
        concised_texts = {f"concised-{index}" for index in range(70)}
        projected = activation.activate_revised(
            {
                "fallbackBasis": {
                    "concisedProjectionChecksumSha256": "old",
                    "concisedAcceptedCandidateCount": 52,
                    "fallbackCandidateCount": 8,
                    "fallbackCandidateTexts": [
                        "中文", "謝謝", "target-a", "target-b", "target-c", "target-d",
                        "target-e", "target-f",
                    ],
                },
                "rows": [
                    {"lookupText": "中文", "trainerReading": "ㄓㄨㄥ1 ㄨㄣ2"},
                    {"lookupText": "謝謝", "trainerReading": "ㄒㄧㄝ4 ㄒㄧㄝ5"},
                ],
                "diagnostics": {
                    "sourceRowCount": 100,
                    "candidateScopedSourceRowCount": 4,
                    "acceptedFallbackCount": 2,
                    "unmatchedFallbackTexts": [
                        "target-a", "target-b", "target-c", "target-d", "target-e",
                    ],
                    "multipleReadingTexts": ["target-f"],
                    "omittedNonFallbackSourceRowCount": 96,
                },
            },
            {
                "rows": [
                    {"lookupText": "美國", "trainerReading": "ㄇㄟ3 ㄍㄨㄛ2"},
                    {"lookupText": "中國", "trainerReading": "ㄓㄨㄥ1 ㄍㄨㄛ2"},
                ],
            },
            approved,
            active_texts=active_texts,
            concised_texts=concised_texts,
            concised_sha256="a" * 64,
        )
        self.assertEqual(
            [row["lookupText"] for row in projected["rows"]],
            ["中國", "中文", "美國", "謝謝"],
        )
        self.assertEqual(projected["fallbackBasis"]["concisedAcceptedCandidateCount"], 70)
        self.assertEqual(projected["fallbackBasis"]["fallbackCandidateCount"], 10)
        self.assertEqual(projected["diagnostics"]["acceptedFallbackCount"], 4)
        self.assertEqual(projected["diagnostics"]["candidateScopedSourceRowCount"], 6)

    def test_committed_activation_report_is_locked(self) -> None:
        if not activation.DEFAULT_OUTPUT_REPORT.exists():
            self.skipTest("reviewed-20 activation artifacts are not committed yet")
        report = activation.validate_committed_activation()
        self.assertEqual(report["activeCount"], 80)
        self.assertEqual(report["activatedCount"], 20)
        self.assertEqual(report["readingAuthorityCounts"], activation.EXPECTED_READING_COUNTS)


if __name__ == "__main__":
    unittest.main()

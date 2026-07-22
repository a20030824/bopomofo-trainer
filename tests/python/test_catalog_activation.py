from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))

import catalog_activation as activation  # noqa: E402


class ActivationStateTest(unittest.TestCase):
    APPROVED_TEXTS = ["fixture-a", "fixture-b"]

    def test_rejects_partial_promotion(self) -> None:
        baseline = [{"text": f"base-{index}"} for index in range(10)]
        self.assertEqual(
            activation.activation_state(
                baseline,
                key="text",
                approved_texts=self.APPROVED_TEXTS,
                baseline_count=10,
                target_count=12,
                label="fixture",
            ),
            "baseline",
        )
        activated = [*baseline, *({"text": text} for text in self.APPROVED_TEXTS)]
        self.assertEqual(
            activation.activation_state(
                activated,
                key="text",
                approved_texts=self.APPROVED_TEXTS,
                baseline_count=10,
                target_count=12,
                label="fixture",
            ),
            "activated",
        )
        with self.assertRaisesRegex(ValueError, "partial activation"):
            activation.activation_state(
                [*baseline, {"text": self.APPROVED_TEXTS[0]}],
                key="text",
                approved_texts=self.APPROVED_TEXTS,
                baseline_count=10,
                target_count=12,
                label="fixture",
            )


class ComputeReadingAuthorityCountsTest(unittest.TestCase):
    def test_accumulates_by_authority_and_maps_cedict_unique(self) -> None:
        previous = {"moe-concised": 70, "moe-revised": 4, "cedict": 4, "manual": 2}
        approved = [
            {"reading_authority": "moe-concised"},
            {"reading_authority": "moe-concised"},
            {"reading_authority": "moe-revised"},
            {"reading_authority": "cedict-unique"},
        ]
        result = activation.compute_reading_authority_counts(previous, approved)
        self.assertEqual(
            result,
            {"moe-concised": 72, "moe-revised": 5, "cedict": 5, "manual": 2},
        )
        # the input mapping is not mutated
        self.assertEqual(previous["moe-concised"], 70)

    def test_empty_approval_list_leaves_counts_unchanged(self) -> None:
        previous = {"moe-concised": 70, "moe-revised": 4, "cedict": 4, "manual": 2}
        self.assertEqual(activation.compute_reading_authority_counts(previous, []), previous)


class ResolveBaselineStateTest(unittest.TestCase):
    def test_chains_from_previous_report(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            report_path = Path(temporary) / "previous-report.json"
            report_path.write_text(
                json.dumps({
                    "activeCount": 80,
                    "readingAuthorityCounts": {
                        "moe-concised": 70, "moe-revised": 4, "cedict": 4, "manual": 2,
                    },
                }),
                encoding="utf-8",
            )
            batch = activation.BatchIdentity(
                slug="test",
                order_range_label="orders 1-1",
                review_slice=None,  # not needed by resolve_baseline_state
                previous_report_path=report_path,
            )
            baseline_count, reading_counts = activation.resolve_baseline_state(batch)
            self.assertEqual(baseline_count, 80)
            self.assertEqual(
                reading_counts,
                {"moe-concised": 70, "moe-revised": 4, "cedict": 4, "manual": 2},
            )

    def test_uses_initial_values_when_there_is_no_previous_report(self) -> None:
        batch = activation.BatchIdentity(
            slug="test",
            order_range_label="orders 1-1",
            review_slice=None,
            previous_report_path=None,
            initial_baseline_count=49,
            initial_reading_authority_counts={
                "moe-concised": 41, "moe-revised": 2, "cedict": 4, "manual": 2,
            },
        )
        baseline_count, reading_counts = activation.resolve_baseline_state(batch)
        self.assertEqual(baseline_count, 49)
        self.assertEqual(
            reading_counts,
            {"moe-concised": 41, "moe-revised": 2, "cedict": 4, "manual": 2},
        )

    def test_requires_initial_values_when_there_is_no_previous_report(self) -> None:
        batch = activation.BatchIdentity(
            slug="test",
            order_range_label="orders 1-1",
            review_slice=None,
            previous_report_path=None,
        )
        with self.assertRaisesRegex(ValueError, "no previous report and no initial baseline"):
            activation.resolve_baseline_state(batch)


class ActivateRevisedTest(unittest.TestCase):
    def test_adds_new_entries_and_recomputes_fallback_metadata(self) -> None:
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
            "中文", "謝謝", "美國", "中國",
            "target-a", "target-b", "target-c", "target-d", "target-e", "target-f",
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
            baseline_count=2,
            target_count=4,
        )
        self.assertEqual(
            [row["lookupText"] for row in projected["rows"]],
            ["中國", "中文", "美國", "謝謝"],
        )
        self.assertEqual(projected["fallbackBasis"]["concisedAcceptedCandidateCount"], 70)
        self.assertEqual(projected["fallbackBasis"]["fallbackCandidateCount"], 10)
        self.assertEqual(projected["diagnostics"]["acceptedFallbackCount"], 4)
        self.assertEqual(projected["diagnostics"]["candidateScopedSourceRowCount"], 6)


class ActivateConcisedTest(unittest.TestCase):
    def test_entry_count_reflects_the_whole_active_catalog_not_the_concised_subset(self) -> None:
        """Regression test: candidateSet.entryCount/normalizedTextCount must be the
        *overall* active-catalog size, not the (smaller) number of Concised-resolved
        rows -- these are two different counts that a prior refactor once conflated.
        """
        approved = [
            {"text": "新詞", "reading_authority": "moe-concised", "reading_evidence": "ㄒㄧㄣ1 ㄘ2"},
        ]
        projected = activation.activate_concised(
            {
                "candidateSet": {"entryCount": 79, "normalizedTextCount": 79},
                "rows": [{"lookupText": "既有詞", "trainerReading": "ㄐㄧ4 ㄧㄡ3 ㄘ2"}],
                "diagnostics": {
                    "sourceRowCount": 1000,
                    "candidateScopedSourceRowCount": 2,
                    "acceptedCandidateCount": 1,
                },
            },
            {"rows": [{"lookupText": "新詞", "trainerReading": "ㄒㄧㄣ1 ㄘ2"}]},
            approved,
            baseline_count=1,
            target_count=2,
            active_catalog_count=80,
        )
        self.assertEqual(projected["candidateSet"]["entryCount"], 80)
        self.assertEqual(projected["candidateSet"]["normalizedTextCount"], 80)
        self.assertEqual(len(projected["rows"]), 2)


if __name__ == "__main__":
    unittest.main()

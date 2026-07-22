from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))

import activate_reviewed_catalog_entries as activation  # noqa: E402


def approved_rows() -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    for index, text in enumerate(activation.EXPECTED_APPROVED_TEXTS, start=1):
        if text == "一樣":
            roles = "adjectival-predicate"
            frame = "adjectival"
        elif text == "不會":
            roles = "modal"
            frame = "modal"
        else:
            roles = "subject;object"
            frame = "none"
        rows.append({
            "batch_order": str(index),
            "general_rank": str(index),
            "text": text,
            "reading_authority": "moe-concised",
            "reading_evidence_type": "trainer-bopomofo",
            "reading_evidence": f"ㄅㄚ{(index % 5) + 1}",
            "decision": "approved-existing-schema",
            "roles": roles,
            "predicate_frame": frame,
            "standalone_kind": "lexical-prompt",
            "rationale": "fixture",
        })
    return rows


def baseline_words() -> list[dict[str, str]]:
    return [{
        "text": f"基{i:02d}",
        "reading": "ㄅㄚ1",
        "frequency_band": "1",
        "tags": "general",
        "status": "provisional",
        "provenance_ids": "local:sample-v1",
    } for i in range(activation.BASELINE_ACTIVE_COUNT)]


class ActivateReviewedCatalogEntriesTest(unittest.TestCase):
    def test_activation_state_accepts_only_baseline_or_full_state(self) -> None:
        approved = activation.EXPECTED_APPROVED_TEXTS
        baseline = [{"text": f"基{i:02d}"} for i in range(49)]
        self.assertEqual(
            activation.activation_state(
                baseline,
                key="text",
                approved_texts=approved,
                label="fixture",
            ),
            "baseline",
        )
        activated = [*baseline, *({"text": text} for text in approved)]
        self.assertEqual(
            activation.activation_state(
                activated,
                key="text",
                approved_texts=approved,
                label="fixture",
            ),
            "activated",
        )
        with self.assertRaisesRegex(ValueError, "partial activation"):
            activation.activation_state(
                [*baseline, {"text": approved[0]}],
                key="text",
                approved_texts=approved,
                label="fixture",
            )

    def test_appends_exact_reviewed_lexical_and_grammar_rows(self) -> None:
        approved = approved_rows()
        words = activation.activate_csv_rows(
            baseline_words(),
            approved,
            fields=activation.WORDS_FIELDS,
            row_factory=activation.expected_word_row,
            label="fixture words",
        )
        self.assertEqual(len(words), 60)
        self.assertEqual(
            [row["text"] for row in words[-11:]],
            activation.EXPECTED_APPROVED_TEXTS,
        )
        self.assertTrue(all(row["frequency_band"] == "1" for row in words[-11:]))
        self.assertTrue(all(row["status"] == "reviewed" for row in words[-11:]))
        self.assertTrue(
            all(
                row["provenance_ids"] == activation.ACTIVATION_PROVENANCE_ID
                for row in words[-11:]
            )
        )

        grammar_baseline = [{
            "text": f"基{i:02d}",
            "reading": "ㄅㄚ1",
            "roles": "subject",
            "predicate_frame": "none",
            "standalone_kind": "lexical-prompt",
            "provenance_ids": "local:grammar-review-v1",
        } for i in range(49)]
        grammar = activation.activate_csv_rows(
            grammar_baseline,
            approved,
            fields=activation.GRAMMAR_FIELDS,
            row_factory=activation.expected_grammar_row,
            label="fixture grammar",
        )
        annotations = {row["text"]: row for row in grammar}
        self.assertEqual(annotations["一樣"]["predicate_frame"], "adjectival")
        self.assertEqual(annotations["不會"]["roles"], "modal")
        self.assertEqual(annotations["我"]["roles"], "subject;object")

    def test_updates_commonness_and_reading_target_locks(self) -> None:
        approved = approved_rows()
        approved_texts = activation.EXPECTED_APPROVED_TEXTS
        baseline_texts = [f"基{i:02d}" for i in range(49)]
        active_texts = set(baseline_texts) | set(approved_texts)

        commonness = {
            "catalog": {
                "entryCount": 49,
                "normalizedTextCount": 49,
                "identityRule": "fixture",
            },
            "rows": [{
                "generalRank": 100 + index,
                "lexicalText": text,
                "writtenPerMillion": 1.0,
                "spokenPerMillion": 1.0,
            } for index, text in enumerate(baseline_texts)],
            "diagnostics": {
                "sourceRowCount": 200,
                "catalogScopedSourceRowCount": 49,
                "unmatchedCatalogTexts": [],
                "ambiguousCatalogTexts": [],
                "omittedNonCatalogSourceRowCount": 151,
            },
        }
        candidates = {
            text: {
                "generalRank": index,
                "lexicalText": text,
                "writtenPerMillion": float(index),
                "spokenPerMillion": float(index + 1),
            }
            for index, text in enumerate(approved_texts, start=1)
        }
        projected = activation.activate_commonness(
            commonness,
            candidates,
            approved_texts,
            active_texts,
        )
        self.assertEqual(projected["catalog"]["entryCount"], 60)
        self.assertEqual(projected["diagnostics"]["catalogScopedSourceRowCount"], 60)
        self.assertEqual(projected["diagnostics"]["omittedNonCatalogSourceRowCount"], 140)
        self.assertEqual(
            [row["lexicalText"] for row in projected["rows"][:11]],
            approved_texts,
        )

        concised_baseline = [{
            "lookupText": text,
            "trainerReading": "ㄅㄚ1",
        } for text in baseline_texts[:41]]
        top_concised = {
            "rows": [{
                "lookupText": row["text"],
                "trainerReading": row["reading_evidence"],
                "sourceEntryId": f"c{index}",
            } for index, row in enumerate(approved)],
        }
        concised = activation.activate_concised(
            {
                "candidateSet": {
                    "entryCount": 49,
                    "normalizedTextCount": 49,
                },
                "rows": concised_baseline,
                "diagnostics": {
                    "sourceRowCount": 100,
                    "candidateScopedSourceRowCount": 43,
                    "acceptedCandidateCount": 41,
                    "omittedNonCandidateSourceRowCount": 57,
                },
            },
            top_concised,
            approved,
        )
        self.assertEqual(concised["candidateSet"]["entryCount"], 60)
        self.assertEqual(concised["diagnostics"]["acceptedCandidateCount"], 52)
        self.assertEqual(concised["diagnostics"]["candidateScopedSourceRowCount"], 54)
        self.assertEqual(concised["diagnostics"]["omittedNonCandidateSourceRowCount"], 46)

        concised_texts = {row["lookupText"] for row in concised["rows"]}
        fallback_texts = baseline_texts[41:]
        revised = activation.activate_revised(
            {
                "fallbackBasis": {
                    "fallbackCandidateTexts": fallback_texts,
                    "concisedAcceptedCandidateCount": 41,
                    "fallbackCandidateCount": 8,
                    "concisedProjectionChecksumSha256": "old",
                },
                "rows": [
                    {"lookupText": fallback_texts[0]},
                    {"lookupText": fallback_texts[1]},
                ],
            },
            active_texts=active_texts,
            concised_texts=concised_texts,
            concised_sha256="a" * 64,
        )
        self.assertEqual(
            revised["fallbackBasis"]["concisedAcceptedCandidateCount"],
            52,
        )
        self.assertEqual(
            revised["fallbackBasis"]["concisedProjectionChecksumSha256"],
            "a" * 64,
        )

        revised_texts = {row["lookupText"] for row in revised["rows"]}
        cedict_targets = set(fallback_texts) - revised_texts
        cedict = activation.activate_cedict(
            {
                "resolutionBasis": {
                    "candidateEntryCount": 49,
                    "moeAcceptedCandidateCount": 43,
                    "cedictTargetCount": 6,
                    "cedictTargetTexts": sorted(cedict_targets),
                },
                "rows": [],
            },
            active_texts=active_texts,
            moe_accepted_texts=concised_texts | revised_texts,
        )
        self.assertEqual(cedict["resolutionBasis"]["candidateEntryCount"], 60)
        self.assertEqual(cedict["resolutionBasis"]["moeAcceptedCandidateCount"], 54)
        self.assertEqual(cedict["resolutionBasis"]["cedictTargetCount"], 6)

    def test_committed_activation_report_is_internally_locked(self) -> None:
        if not activation.DEFAULT_OUTPUT_REPORT.exists():
            self.skipTest("reviewed activation artifacts are not committed yet")
        report = activation.validate_committed_activation()
        self.assertEqual(report["activeCount"], 60)
        self.assertEqual(report["activatedCount"], 11)
        self.assertEqual(
            report["readingAuthorityCounts"],
            activation.EXPECTED_READING_COUNTS,
        )


if __name__ == "__main__":
    unittest.main()

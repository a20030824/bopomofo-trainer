from __future__ import annotations

import csv
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))

import validate_activation_review_decisions as validator  # noqa: E402


APPROVED_TEXTS = {
    "我",
    "他",
    "你",
    "她",
    "它",
    "自己",
    "他們",
    "地方",
    "孩子",
    "一樣",
    "不會",
}


class ActivationReviewDecisionsTest(unittest.TestCase):
    def load_decisions(self) -> list[dict[str, str]]:
        return validator.load_csv(
            validator.DEFAULT_DECISIONS,
            validator.DECISION_FIELDS,
        )

    def test_committed_decisions_validate(self) -> None:
        result = validator.validate_files()
        self.assertEqual(result["reviewedCount"], 25)
        self.assertEqual(result["approvedCount"], 11)
        self.assertEqual(result["heldCount"], 14)
        self.assertEqual(
            result["determinismDigest"],
            validator.EXPECTED_DECISION_DIGEST,
        )

    def test_approved_identity_set_is_explicit(self) -> None:
        decisions = self.load_decisions()
        approved = {
            row["text"]
            for row in decisions
            if row["decision"] == "approved-existing-schema"
        }
        self.assertEqual(approved, APPROVED_TEXTS)

    def test_review_decisions_match_active_catalog_boundary(self) -> None:
        decisions = self.load_decisions()
        held_texts = {
            row["text"]
            for row in decisions
            if row["decision"] != "approved-existing-schema"
        }
        with (ROOT / "data/source/words.sample.csv").open(
            "r", encoding="utf-8-sig", newline=""
        ) as source:
            active_words = {row["text"] for row in csv.DictReader(source)}
        with (ROOT / "data/source/grammar.sample.csv").open(
            "r", encoding="utf-8-sig", newline=""
        ) as source:
            active_grammar = {row["text"] for row in csv.DictReader(source)}

        self.assertEqual(active_words, active_grammar)
        self.assertTrue(APPROVED_TEXTS.issubset(active_words))
        self.assertTrue(APPROVED_TEXTS.issubset(active_grammar))
        self.assertTrue(held_texts.isdisjoint(active_words))
        self.assertTrue(held_texts.isdisjoint(active_grammar))

    def test_validator_rejects_latent_annotation_on_held_row(self) -> None:
        decisions = self.load_decisions()
        held = next(
            row for row in decisions if row["decision"] != "approved-existing-schema"
        )
        held["roles"] = "subject"
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "decisions.csv"
            with path.open("w", encoding="utf-8", newline="") as destination:
                writer = csv.DictWriter(
                    destination,
                    fieldnames=validator.DECISION_FIELDS,
                    lineterminator="\n",
                )
                writer.writeheader()
                writer.writerows(decisions)
            with self.assertRaisesRegex(ValueError, "held row contains latent"):
                validator.validate_files(decisions_path=path)

    def test_validator_rejects_identity_drift(self) -> None:
        decisions = self.load_decisions()
        decisions[0]["general_rank"] = "999"
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "decisions.csv"
            with path.open("w", encoding="utf-8", newline="") as destination:
                writer = csv.DictWriter(
                    destination,
                    fieldnames=validator.DECISION_FIELDS,
                    lineterminator="\n",
                )
                writer.writeheader()
                writer.writerows(decisions)
            with self.assertRaisesRegex(ValueError, "identity mismatch"):
                validator.validate_files(decisions_path=path)


if __name__ == "__main__":
    unittest.main()
